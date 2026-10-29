"""Run integration inside the disposable Compose executor with RUN_GRADING_INTEGRATION=1."""
import concurrent.futures
import importlib.util
import json
import os
import pathlib
import secrets
import tempfile
import time
import unittest
from unittest.mock import patch

SOURCE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('mongo_executor', SOURCE / 'executor.py')
executor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(executor)


class ExecutorTests(unittest.TestCase):
    def test_rejects_missing_scope_and_invalid_flags_before_execution(self):
        for body in [{'queries': ['1']}, {'executionId': '../escape', 'queries': ['1']},
                     {'executionId': 'scope', 'queries': ['1'], 'readOnly': 'true'},
                     {'executionId': 'scope', 'queries': ['x' * 70000]}]:
            with self.assertRaises(ValueError):
                executor.mongo_execute(body)

    def test_verification_cannot_create_an_expired_workspace(self):
        with self.assertRaisesRegex(ValueError, 'expired'):
            executor.mongo_execute({'executionId': 'expired', 'queries': ['1'], 'noReset': True})

    def test_workspace_credentials_are_unique_and_roles_scope_each_database(self):
        one, two = executor.Workspace('one'), executor.Workspace('two')
        self.assertNotEqual(one.name, two.name)
        self.assertNotEqual(one.password, two.password)
        with patch.object(executor, 'admin') as admin:
            one.initialize()
            code = admin.call_args.args[0]
            self.assertIn('"db": "' + one.name + '"', code)
            self.assertIn('"role": "readWrite"', code)
            self.assertIn('"role": "read"', code)
            self.assertNotIn(two.name, code)


@unittest.skipUnless(os.environ.get('RUN_GRADING_INTEGRATION') == '1', 'Requires disposable Compose services')
class MongoIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.dataset = pathlib.Path(cls.directory.name) / 'dataset.js'
        cls.dataset.write_text('db.people.insertMany([{name:"Alice",a:1},{name:"Bob",a:2}])')
        cls.environment = patch.dict(os.environ, {'MONGO_DATASET': str(cls.dataset)})
        cls.environment.start()

    @classmethod
    def tearDownClass(cls):
        cls.environment.stop()
        cls.directory.cleanup()

    def setUp(self):
        self.scope = secrets.token_hex(12)

    def tearDown(self):
        executor.cleanup(self.scope)

    def execute(self, code, scope=None, **flags):
        return executor.mongo_execute({'executionId': scope or self.scope, 'queries': [code], **flags})

    def test_cursor_extended_json_and_legacy_verification(self):
        rows = json.loads(self.execute('db.people.find({}, {_id:0}).toArray()')['response'])
        self.assertEqual(rows[0], {'name': 'Alice', 'a': {'$numberInt': '1'}})
        self.execute('db.people.updateMany({}, {$set:{name:"Carol"}})')
        rows = json.loads(self.execute('db.people.find({}, {_id:0}).toArray()', noReset=True, readOnly=True)['response'])
        self.assertEqual([row['name'] for row in rows], ['Carol', 'Carol'])

    def test_trusted_state_observation_and_reader_cannot_write(self):
        result = self.execute('db.people.updateOne({name:"Alice"}, {$set:{a:3}})', captureState=True)
        before, after = [json.loads(result['state'][key])['people']['documents'] for key in ['before', 'after']]
        self.assertNotEqual(before, after)
        with self.assertRaisesRegex(RuntimeError, 'not authorized|Unauthorized'):
            self.execute('db.people.updateMany({}, {$set:{name:"Mallory"}})', noReset=True, readOnly=True)

    def test_scopes_preserve_independent_state_and_cannot_access_each_other(self):
        other = secrets.token_hex(12)
        try:
            self.execute('db.people.updateMany({}, {$set:{name:"First"}})')
            self.execute('db.people.updateMany({}, {$set:{name:"Second"}})', scope=other)
            rows = json.loads(self.execute('db.people.find({}, {_id:0}).toArray()', noReset=True)['response'])
            self.assertEqual([row['name'] for row in rows], ['First', 'First'])
            other_name = executor.WORKSPACES[other].name
            with self.assertRaisesRegex(RuntimeError, 'not authorized|Unauthorized'):
                self.execute(f'db.getSiblingDB({json.dumps(other_name)}).people.find().toArray()', noReset=True)
            rows = json.loads(self.execute('db.people.find({}, {_id:0}).toArray()', scope=other, noReset=True)['response'])
            self.assertEqual([row['name'] for row in rows], ['Second', 'Second'])
        finally:
            executor.cleanup(other)

    def test_scopes_execute_concurrently_without_resetting_other_jobs(self):
        other = secrets.token_hex(12)
        try:
            self.execute('1')
            self.execute('1', scope=other)
            with concurrent.futures.ThreadPoolExecutor(2) as pool:
                slow = pool.submit(self.execute, 'sleep(4000); 1', noReset=True)
                time.sleep(0.5)
                fast = pool.submit(self.execute, '2', scope=other, noReset=True)
                self.assertIn('$numberInt', fast.result(timeout=3)['response'])
                self.assertFalse(slow.done())
                slow.result(timeout=8)
        finally:
            executor.cleanup(other)

    def test_submitted_process_cannot_read_supervisor_environment_or_control_socket(self):
        for code in ["require('fs').readFileSync('/proc/1/environ', 'utf8')",
                     "require('fs').readFileSync('/proc/' + process.ppid + '/environ', 'utf8')",
                     "process.kill(1, 'SIGKILL')",
                     "(async () => await new Promise((resolve,reject) => {const s=require('net').connect('/run/execution/mongo.sock'); s.on('error',reject); s.on('connect',()=>{s.end();resolve('connected')})}))()",
                     "require('fs').writeFileSync('/run/execution/injected', 'bad')"]:
            with self.assertRaisesRegex(RuntimeError, 'EACCES|EPERM'):
                self.execute(code)
        result = self.execute('JSON.stringify(process.env)')['response']
        self.assertNotIn(executor.PASSWORD, result)

    def test_detached_descendants_are_killed_before_reusing_the_os_identity(self):
        result = self.execute("const child=require('child_process').spawn('sh',['-c','sleep 60'], {detached:true,stdio:'ignore',env:{PATH:'/usr/bin:/bin'}}); child.unref(); child.pid")
        pid = int(json.loads(result['response'])['$numberInt'])
        status = pathlib.Path(f'/proc/{pid}/status')
        if status.exists():
            self.assertIn('State:\tZ', status.read_text())

    def test_output_limits_timeout_and_cleanup_leave_other_scope_usable(self):
        self.execute('1')
        workspace = executor.WORKSPACES[self.scope]
        with self.assertRaisesRegex(RuntimeError, 'time limit'):
            executor.run_shell('while(true){}', workspace.uri(), time.monotonic() + 0.5)
        with self.assertRaisesRegex(RuntimeError, 'output limit'):
            executor.run_shell('print("x".repeat(1100000))', workspace.uri(), time.monotonic() + 10)
        self.assertIn('$numberInt', self.execute('2', noReset=True)['response'])
        executor.cleanup(self.scope)
        self.assertNotIn(self.scope, executor.WORKSPACES)
        users = json.loads(executor.admin('(async () => (await db.runCommand({usersInfo:1})).users)()'))
        self.assertFalse(any(user['user'].startswith(workspace.name) for user in users))

    def test_internal_database_names_are_stable_in_outputs(self):
        self.assertEqual(json.loads(self.execute('db.getName()')['response']), 'grading')


if __name__ == '__main__':
    unittest.main()
