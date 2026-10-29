#!/usr/bin/python3 -I
"""Compose-owned MongoDB executor. No container runtime or host access is needed."""
import hashlib
from collections import deque
import http.server
import json
import os
import pathlib
import re
import secrets
import selectors
import shutil
import signal
import socketserver
import subprocess
import tempfile
import threading
import time
from urllib.parse import quote

BASE = pathlib.Path(__file__).resolve().parent
HOST = os.environ.get('GRADING_MONGO_HOST', 'grading-mongo')
PASSWORD = os.environ.get('GRADING_MONGO_PASSWORD', '')
LIMIT = 1024 * 1024
WORKSPACES = {}
LOCK = threading.Lock()
FREE_UIDS = deque(range(20000, 20100))


def kill_uid(uid):
    # Include descendants which called setsid() to escape the original process group.
    for _ in range(100):
        found = False
        for path in pathlib.Path('/proc').glob('[0-9]*/status'):
            try:
                if int(re.search(r'^Uid:\s+(\d+)', path.read_text(), re.M)[1]) == uid:
                    # A zombie has no resources or ability to fork. PID 1 reaps it.
                    if not re.search(r'^State:\s+Z', path.read_text(), re.M):
                        found = True
                        os.kill(int(path.parent.name), signal.SIGKILL)
            except (FileNotFoundError, ProcessLookupError):
                pass
        if not found:
            return
        time.sleep(0.01)
    raise RuntimeError('Unable to clean execution processes')


def run_shell(code, uri, deadline, trusted=False):
    uid = None
    directory = tempfile.mkdtemp(prefix='execution-', dir='/tmp')
    if trusted:
        command = ['mongosh', '--nodb', '--quiet', '--json=canonical']
    else:
        with LOCK:
            uid = FREE_UIDS.popleft()
        os.chown(directory, uid, uid)
        command = ['/usr/bin/python3', '-I', str(BASE / 'sandbox.py'), str(uid), directory]
    proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            start_new_session=True, env={
                                'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': directory, 'TMPDIR': directory,
                                'NODE_OPTIONS': '--require ' + str(BASE / 'bootstrap.cjs'),
                            })
    payload = json.dumps({'uri': uri, 'code': code}).encode()
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
            raise RuntimeError((stderr or stdout).decode(errors='replace')[-4096:] or 'MongoDB query failed')
        return stdout.decode(errors='replace')
    finally:
        selector.close()
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        proc.wait()
        if uid is not None:
            kill_uid(uid)
            with LOCK:
                FREE_UIDS.append(uid)
        writer.join(timeout=1)
        proc.stdout.close()
        proc.stderr.close()
        shutil.rmtree(directory)


def admin(code):
    uri = f'mongodb://root:{quote(PASSWORD, safe="")}@{HOST}:27017/admin'
    return run_shell(code, uri, time.monotonic() + 15, trusted=True)


class Workspace:
    def __init__(self, execution_id):
        self.name = 'grading_' + hashlib.sha256(execution_id.encode()).hexdigest()[:32]
        self.writer = self.name + '_writer'
        self.reader = self.name + '_reader'
        self.password = secrets.token_hex(32)
        self.lock = threading.Lock()
        self.touched = time.monotonic()
        self.initialized = False

    def initialize(self):
        code = ''
        for user, role in [(self.writer, 'readWrite'), (self.reader, 'read')]:
            code += 'db.createUser(' + json.dumps({'user': user, 'pwd': self.password,
                     'roles': [{'role': role, 'db': self.name}]}) + ');'
        admin(code)
        self.initialized = True

    def uri(self, read_only=False):
        user = self.reader if read_only else self.writer
        return f'mongodb://{user}:{self.password}@{HOST}:27017/{self.name}?authSource=admin'

    def kill_operations(self):
        users = json.dumps([self.writer, self.reader])
        admin(f'db.currentOp({{active:true}}).inprog.filter(o=>(o.effectiveUsers||[]).some(u=>{users}.includes(u.user))).forEach(o=>db.killOp(o.opid))')

    def cleanup(self):
        self.kill_operations()
        admin(f'db.getSiblingDB({json.dumps(self.name)}).dropDatabase();'
              f'db.dropUser({json.dumps(self.writer)});db.dropUser({json.dumps(self.reader)});')
        self.initialized = False


MONGO_SNAPSHOT = """(async function () {
    const result = Object.create(null);
    for (const info of db.getCollectionInfos()) {
        const collection = db.getCollection(info.name);
        result[info.name] = {
            type: info.type, options: info.options,
            documents: info.type === 'view' ? [] : await collection.find().toArray(),
            indexes: info.type === 'view' ? [] : (await collection.getIndexes()).map(index => ({
                ...index, key: Object.entries(index.key)
            }))
        };
    }
    return result;
})()"""


def workspace_id(body):
    value = body.get('executionId')
    if not isinstance(value, str) or not re.fullmatch(r'[a-zA-Z0-9:-]{1,160}', value):
        raise ValueError('Invalid execution scope')
    return value


def mongo_execute(body):
    execution_id = workspace_id(body)
    queries = body.get('queries')
    if not isinstance(queries, list) or len(queries) > 100 or any(not isinstance(q, str) for q in queries):
        raise ValueError('Invalid queries')
    if sum(len(q.encode()) for q in queries) > 65536 + 1024:
        raise ValueError('Query input limit exceeded')
    for flag in ['noReset', 'readOnly', 'captureState']:
        if not isinstance(body.get(flag, False), bool):
            raise ValueError('Invalid ' + flag + ' flag')
    with LOCK:
        workspace = WORKSPACES.get(execution_id)
        if not workspace:
            if body.get('noReset'):
                raise ValueError('Execution scope has expired')
            if len(WORKSPACES) >= 16:
                raise RuntimeError('MongoDB executor is full; try again shortly')
            workspace = WORKSPACES[execution_id] = Workspace(execution_id)
    with workspace.lock:
        workspace.touched = time.monotonic()
        try:
            if not workspace.initialized:
                workspace.initialize()
            deadline = time.monotonic() + 20
            if not body.get('noReset', False):
                workspace.kill_operations()
                admin(f'db.getSiblingDB({json.dumps(workspace.name)}).dropDatabase()')
                run_shell(pathlib.Path(os.environ.get('MONGO_DATASET', '/datasets/dataset.js')).read_text(),
                          workspace.uri(), deadline)
            code = ';'.join(q.strip() for q in queries if q.strip())
            if not code:
                return {'response': 'Dataset loaded', 'skipped': True, 'protocolVersion': 3}
            before = run_shell(MONGO_SNAPSHOT, workspace.uri(True), deadline) if body.get('captureState') else None
            response = run_shell(code, workspace.uri(body.get('readOnly', False)), deadline)
            result = {'response': response, 'protocolVersion': 3}
            if before is not None:
                result['state'] = {'engine': 'mongodb', 'before': before,
                                   'after': run_shell(MONGO_SNAPSHOT, workspace.uri(True), deadline), 'startedAt': 0}
            # Internal workspace names must not invalidate cached reference outputs.
            return json.loads(json.dumps(result).replace(workspace.name, 'grading'))
        except Exception:
            workspace.cleanup()
            with LOCK:
                WORKSPACES.pop(execution_id, None)
            raise
        finally:
            workspace.touched = time.monotonic()


def cleanup(execution_id, idle_only=False):
    with LOCK:
        workspace = WORKSPACES.get(execution_id)
    if workspace:
        with workspace.lock:
            if idle_only and time.monotonic() - workspace.touched <= 180:
                return
            workspace.cleanup()
            with LOCK:
                WORKSPACES.pop(execution_id, None)


def reap():
    # API crashes/disconnects must not leave databases or credentials indefinitely.
    while True:
        time.sleep(30)
        with LOCK:
            expired = [key for key, value in WORKSPACES.items() if time.monotonic() - value.touched > 180]
        for key in expired:
            try:
                cleanup(key, idle_only=True)
            except Exception:
                pass  # Retry on the next pass after a database outage.


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        self.connection.settimeout(5)
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 131072:
                raise ValueError('Invalid request size')
            body = json.loads(self.rfile.read(size))
            if self.path == '/mongo':
                data = mongo_execute(body)
            elif self.path == '/cleanup':
                cleanup(workspace_id(body))
                data = {'response': 'Workspace removed'}
            else:
                raise ValueError('Unknown operation')
            result = {'ok': True, 'data': data, 'error': None}
        except Exception as error:
            result = {'ok': False, 'data': None, 'error': str(error)}
        encoded = json.dumps(result).encode()
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
    slots = threading.BoundedSemaphore(4)

    def process_request(self, request, client_address):
        self.slots.acquire()
        super().process_request(request, client_address)

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


if __name__ == '__main__':
    if not PASSWORD:
        raise RuntimeError('GRADING_MONGO_PASSWORD is required')
    # This MongoDB service holds grading data only. Reap leftovers from executor crashes.
    admin('''(async () => {
        const databases = await db.adminCommand({listDatabases:1,nameOnly:true});
        for (const d of databases.databases) {
            if (/^grading_[a-f0-9]{32}$/.test(d.name)) await db.getSiblingDB(d.name).dropDatabase();
        }
        const users = await db.runCommand({usersInfo:1});
        for (const u of users.users) {
            if (/^grading_[a-f0-9]{32}_(writer|reader)$/.test(u.user)) await db.dropUser(u.user);
        }
    })()''')
    socket_path = pathlib.Path(os.environ.get('MONGO_EXECUTOR_SOCKET', '/run/execution/mongo.sock'))
    socket_path.parent.mkdir(parents=True, exist_ok=True)
    socket_path.unlink(missing_ok=True)
    server = Server(str(socket_path), Handler)
    os.chown(socket_path, 0, 1000)  # Bun API group; submitted processes have distinct groups.
    os.chmod(socket_path, 0o660)
    threading.Thread(target=reap, daemon=True).start()
    print('MongoDB executor ready', flush=True)
    server.serve_forever()
