#!/usr/bin/python3 -I
"""Optional host SSH identity approval. Grading runs entirely in Compose services."""
import http.client
import http.server
import json
import os
import pathlib
import pwd
import secrets
import shutil
import socket
import socketserver
import struct
import threading

BASE = pathlib.Path(__file__).resolve().parent
CONFIG = json.loads((BASE / 'config.json').read_text())
OWNER = os.getuid()


def approval(code, uid):
    account = pwd.getpwuid(uid).pw_name
    login = CONFIG.get('accounts', {}).get(account, account)
    conn = http.client.HTTPConnection('localhost', timeout=5)
    conn.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    conn.sock.settimeout(5)
    conn.sock.connect(CONFIG['approvalSocket'])
    try:
        conn.request('POST', '/approve', json.dumps({'code': code, 'login': login}), {'Content-Type': 'application/json'})
        response = conn.getresponse()
        data = json.loads(response.read(4096))
        if response.status != 200 or not data.get('ok'):
            raise ValueError(data.get('error', 'Approval failed'))
        return {'login': login}
    finally:
        conn.close()


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def do_POST(self):
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 4096:
                raise ValueError('Invalid request size')
            body = json.loads(self.rfile.read(size))
            if self.path != '/approve' or set(body) != {'code'}:
                raise ValueError('Only code approval is permitted')
            _, uid, _ = struct.unpack('3i', self.connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
            result = approval(body['code'], uid)
            output = {'ok': True, 'data': result, 'error': None}
        except Exception as error:
            output = {'ok': False, 'data': None, 'error': str(error)}
        encoded = json.dumps(output).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(encoded)))
        self.end_headers()
        try:
            self.wfile.write(encoded)
        except BrokenPipeError:
            pass


class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True
    slots = threading.BoundedSemaphore(16)

    def process_request(self, request, client_address):
        if not self.slots.acquire(False):
            self.shutdown_request(request)
            return
        super().process_request(request, client_address)

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


def listen(path, public):
    path = pathlib.Path(path)
    if path.exists():
        if not path.is_socket() or path.stat().st_uid != OWNER:
            raise RuntimeError('Unsafe existing socket path')
        path.unlink()
    server = Server(str(path), Handler)
    server.public = public
    os.chmod(path, 0o666)
    return server


if __name__ == '__main__':
    public_dir = pathlib.Path(CONFIG['loginSocket']).parent
    public_dir.mkdir(mode=0o755, parents=True, exist_ok=True)
    if public_dir.stat().st_uid != OWNER or public_dir.stat().st_mode & 0o022:
        raise RuntimeError('Unsafe public login directory')
    temporary_cli = public_dir / ('portal-login-' + secrets.token_hex(8))
    shutil.copyfile(BASE / 'portal-login', temporary_cli)
    temporary_cli.chmod(0o755)
    temporary_cli.replace(public_dir / 'portal-login')
    public = listen(CONFIG['loginSocket'], True)
    print('SSH login approval ready', flush=True)
    public.serve_forever()
