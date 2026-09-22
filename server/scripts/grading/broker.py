#!/usr/bin/python3 -I
"""Host-owned broker. Student JavaScript runs only in disposable rootless containers."""
import http.client
import http.server
import json
import os
import pathlib
import pwd
import secrets
import shutil
import selectors
import socket
import socketserver
import struct
import subprocess
import threading
import time

BASE = pathlib.Path(__file__).resolve().parent
CONFIG = json.loads((BASE / 'config.json').read_text())
OWNER = os.getuid()
MONGO = 'dbs-grading-mongo'
REDIS = 'dbs-grading-redis'
MONGO_VOL = 'dbs-grading-mongo-socket'
REDIS_VOL = 'dbs-grading-redis-socket'
LIMIT = 1024 * 1024
LOCK = threading.Lock()
ROOT_PASSWORD = ''
GRADER_PASSWORD = ''


def podman(*args, input=None, timeout=30):
    result = subprocess.run(['podman', *args], input=input, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if result.returncode:
        raise RuntimeError('Container operation failed: ' + result.stderr.decode(errors='replace')[-1000:])
    return result.stdout


def mongo_admin(code, bootstrap=False):
    uri = 'mongodb://127.0.0.1:27017/admin'
    if not bootstrap:
        uri = f'mongodb://root:{ROOT_PASSWORD}@127.0.0.1:27017/admin'
    payload = json.dumps({'uri': uri, 'code': code}).encode()
    # Credential and code travel on stdin, not the host process command line.
    return podman('exec', '-i', '--env', 'NODE_OPTIONS=--require /opt/grading-bootstrap.cjs', MONGO, 'mongosh', '--nodb', '--quiet', input=payload)


def start_mongo():
    global ROOT_PASSWORD, GRADER_PASSWORD
    subprocess.run(['podman', 'rm', '-f', '-t', '0', MONGO], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ROOT_PASSWORD, GRADER_PASSWORD = secrets.token_hex(32), secrets.token_hex(32)
    if subprocess.run(['podman', 'volume', 'exists', MONGO_VOL]).returncode:
        podman('volume', 'create', MONGO_VOL)
    podman('run', '-d', '--name', MONGO, '--network', 'none', '--memory', '1g', '--cpus', '2', '--pids-limit', '256',
           '--read-only', '--tmpfs', '/data/db:rw,size=768m', '--tmpfs', '/data/configdb:rw,size=16m',
           '-v', MONGO_VOL + ':/run/grading-mongo', '-v', str(BASE / 'bootstrap.cjs') + ':/opt/grading-bootstrap.cjs:ro', '--entrypoint', 'sh', CONFIG['mongoImage'], '-c',
           'chmod 777 /run/grading-mongo; exec docker-entrypoint.sh mongod --auth --bind_ip 127.0.0.1 '
           '--unixSocketPrefix /run/grading-mongo --filePermissions 0666 --wiredTigerCacheSizeGB 0.25')
    for _ in range(30):
        try:
            mongo_admin('db.runCommand({ping:1})', bootstrap=True)
            break
        except Exception:
            time.sleep(0.5)
    else:
        raise RuntimeError('Grading MongoDB did not become ready')
    mongo_admin('db.createUser(' + json.dumps({'user': 'root', 'pwd': ROOT_PASSWORD, 'roles': ['root']}) + ')', bootstrap=True)
    mongo_admin('db.createUser(' + json.dumps({'user': 'grader', 'pwd': GRADER_PASSWORD,
        'roles': [{'role': 'readWrite', 'db': 'grading'}]}) + ')')


def start_redis():
    subprocess.run(['podman', 'rm', '-f', '-t', '0', REDIS], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if subprocess.run(['podman', 'volume', 'exists', REDIS_VOL]).returncode:
        podman('volume', 'create', REDIS_VOL)
    podman('run', '-d', '--name', REDIS, '--network', 'none', '--memory', '512m', '--cpus', '1', '--pids-limit', '128',
           '--read-only', '--tmpfs', '/data:rw,size=256m', '-v', REDIS_VOL + ':/run/grading-redis',
           '--entrypoint', 'sh', CONFIG['redisImage'], '-c',
           'chmod 777 /run/grading-redis; exec redis-server --loadmodule /opt/redis-stack/lib/redisearch.so '
           '--loadmodule /opt/redis-stack/lib/rejson.so --port 0 '
           '--unixsocket /run/grading-redis/redis.sock --unixsocketperm 666 '
           '--save "" --appendonly no --databases 1 --maxmemory 128mb --maxmemory-policy noeviction '
           '--client-output-buffer-limit "normal 1048576 0 0" --lua-time-limit 1000 '
           '--user default on nopass "~*" "&*" +@all -@admin -migrate -restore-asking')
    for _ in range(30):
        try:
            if b'PONG' in podman('exec', REDIS, 'redis-cli', '-s', '/run/grading-redis/redis.sock', 'PING'):
                return
        except Exception:
            pass
        time.sleep(0.2)
    raise RuntimeError('Grading Redis did not become ready')


def run_shell(code, deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise RuntimeError('Execution time limit exceeded')
    name = 'dbs-grading-job-' + secrets.token_hex(8)
    uri = f'mongodb://grader:{GRADER_PASSWORD}@%2Frun%2Fgrading-mongo%2Fmongodb-27017.sock/grading?authSource=admin'
    args = ['podman', 'run', '--rm', '-i', '--name', name, '--network', 'none', '--read-only',
            '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', '256m', '--cpus', '1',
            '--pids-limit', '64', '--user', '1000:1000', '--tmpfs', '/tmp:rw,size=32m,mode=1777',
            '-e', 'HOME=/tmp', '-e', 'NODE_OPTIONS=--require /opt/grading-bootstrap.cjs',
            '-v', str(BASE / 'bootstrap.cjs') + ':/opt/grading-bootstrap.cjs:ro',
            '-v', MONGO_VOL + ':/run/grading-mongo:ro',
            '--entrypoint', 'mongosh', CONFIG['mongoImage'], '--nodb', '--quiet']
    proc = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    payload = json.dumps({'uri': uri, 'code': code}).encode()
    # The dataset can exceed pipe capacity; feed stdin while draining bounded output.
    def feed():
        try:
            proc.stdin.write(payload)
            proc.stdin.close()
        except (BrokenPipeError, OSError):
            pass
    writer = threading.Thread(target=feed, daemon=True)
    writer.start()
    stdout, stderr = bytearray(), bytearray()
    selector = selectors.DefaultSelector()
    selector.register(proc.stdout, selectors.EVENT_READ, stdout)
    selector.register(proc.stderr, selectors.EVENT_READ, stderr)
    try:
        while selector.get_map():
            if time.monotonic() >= deadline:
                raise RuntimeError('Execution time limit exceeded')
            for key, _ in selector.select(min(0.2, max(0, deadline - time.monotonic()))):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                key.data.extend(chunk)
                if len(stdout) + len(stderr) > LIMIT:
                    raise RuntimeError('Execution output limit exceeded')
        proc.wait(timeout=max(0.1, deadline - time.monotonic()))
        if proc.returncode:
            raise RuntimeError(stderr.decode(errors='replace')[-4096:] or 'MongoDB query failed')
        return stdout.decode(errors='replace')
    finally:
        selector.close()
        subprocess.run(['podman', 'rm', '-f', '-t', '0', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
        if proc.poll() is None:
            proc.kill()
        proc.wait()
        writer.join(timeout=1)


def mongo_execute(body):
    queries = body.get('queries')
    if not isinstance(queries, list) or len(queries) > 100 or any(not isinstance(q, str) for q in queries):
        raise ValueError('Invalid queries')
    if sum(len(q.encode()) for q in queries) > 65536:
        raise ValueError('Query input limit exceeded')
    if not isinstance(body.get('noReset', False), bool):
        raise ValueError('Invalid reset flag')
    deadline = time.monotonic() + 20
    if not body.get('noReset', False):
        # Kill any abandoned server-side work and remove the whole grading DB.
        mongo_admin("db.currentOp({active:true}).inprog.filter(o=>(o.effectiveUsers||[]).some(u=>u.user==='grader')).forEach(o=>db.killOp(o.opid)); db.getSiblingDB('grading').dropDatabase()")
        run_shell(pathlib.Path(CONFIG['dataset']).read_text(), deadline)
    code = ';'.join(q.strip() for q in queries if q.strip())
    if not code:
        return {'response': 'Dataset loaded', 'skipped': True}
    return {'response': run_shell(code, deadline)}


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
        pass  # Never log queries, login codes, or transient credentials.

    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def do_POST(self):
        status = 200
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 131072:
                raise ValueError('Invalid request size')
            body = json.loads(self.rfile.read(size))
            _, uid, _ = struct.unpack('3i', self.connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
            if self.server.public:
                if self.path != '/approve' or set(body) != {'code'}:
                    raise ValueError('Only code approval is permitted')
                result = approval(body['code'], uid)
            else:
                # This socket lives below a host-private directory and is bind-mounted
                # only into the trusted API. Never mount it into execution containers.
                with LOCK:
                    if self.path == '/mongo':
                        try:
                            result = mongo_execute(body)
                        except Exception as original:
                            try:
                                start_mongo()  # Clean state before the next job, including after timeouts.
                            except Exception as recovery:
                                raise RuntimeError(str(original) + '; recovery failed: ' + str(recovery)) from original
                            raise
                    elif self.path == '/redis-restart':
                        start_redis()
                        result = {'response': 'Redis restarted'}
                    else:
                        raise ValueError('Unknown operation')
            output = {'ok': True, 'data': result, 'error': None}
        except Exception as error:
            output = {'ok': False, 'data': None, 'error': str(error)}
        encoded = json.dumps(output).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(encoded)))
        self.end_headers()
        try:
            self.wfile.write(encoded)
        except BrokenPipeError:
            pass


class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True
    request_queue_size = 16
    # Limit concurrent handlers even if untrusted local users flood the public socket.
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
    # Reap submission containers left by a broker crash before allowing new work.
    abandoned = podman('ps', '-aq', '--filter', 'name=^dbs-grading-job-').decode().split()
    if abandoned:
        podman('rm', '-f', '-t', '0', *abandoned)
    start_mongo()
    start_redis()
    public = listen(CONFIG['loginSocket'], True)
    threading.Thread(target=public.serve_forever, daemon=True).start()
    private = listen(str(BASE / 'control' / 'broker.sock'), False)
    print('Grading broker ready; databases private; credentials exist only in memory', flush=True)
    private.serve_forever()
