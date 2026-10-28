"""Broker unit tests; opt-in integration uses only uniquely named disposable resources."""
import importlib.util
import json
import os
import pathlib
import secrets
import shutil
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch

SOURCE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('grading_broker', SOURCE / 'broker.py')
broker = importlib.util.module_from_spec(spec)
with patch.object(pathlib.Path, 'read_text', return_value='{}'):
    spec.loader.exec_module(broker)


class BrokerTests(unittest.TestCase):
    def test_read_only_flag_is_validated(self):
        with self.assertRaises(ValueError):
            broker.mongo_execute({'queries': ['1'], 'readOnly': 'true'})

    def test_reset_loads_with_write_access_then_executes_with_requested_access(self):
        with patch.dict(broker.CONFIG, {'dataset': '/unused'}), patch.object(pathlib.Path, 'read_text', return_value='seed'), \
                patch.object(broker, 'mongo_admin'), patch.object(broker, 'run_shell', return_value='[]') as run:
            self.assertEqual(broker.mongo_execute({'queries': ['db.test.find()'], 'readOnly': True}), {'response': '[]', 'protocolVersion': 3})
            self.assertEqual(run.call_args_list[0].args[0], 'seed')
            self.assertEqual(run.call_args_list[0].kwargs, {})
            self.assertEqual(run.call_args_list[1].kwargs, {'read_only': True})


@unittest.skipUnless(os.environ.get('RUN_GRADING_INTEGRATION') == '1', 'Requires disposable rootless Podman fixtures')
class MongoIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # The home directory is also visible to rootless Podman when invoked from a toolbox.
        cls.directory = pathlib.Path(tempfile.mkdtemp(prefix='dbs-grading-test-', dir=pathlib.Path.home()))
        shutil.copyfile(SOURCE / 'bootstrap.cjs', cls.directory / 'bootstrap.cjs')
        (cls.directory / 'bootstrap.cjs').chmod(0o644)
        (cls.directory / 'dataset.js').write_text('db.people.insertMany([{name:"Alice",a:1},{name:"Bob",a:2}])')
        cls.original = {key: getattr(broker, key) for key in ['BASE', 'CONFIG', 'MONGO', 'MONGO_VOL']}
        suffix = secrets.token_hex(6)
        broker.BASE = cls.directory
        broker.CONFIG = {'mongoImage': os.environ.get('TEST_MONGO_IMAGE', 'docker.io/library/mongo:8'),
                         'dataset': str(cls.directory / 'dataset.js')}
        broker.MONGO = 'dbs-grading-test-' + suffix
        broker.MONGO_VOL = 'dbs-grading-test-socket-' + suffix
        try:
            broker.start_mongo()
        except Exception:
            cls.tearDownClass()
            raise

    @classmethod
    def tearDownClass(cls):
        subprocess.run(['podman', 'rm', '-f', '-t', '0', broker.MONGO], capture_output=True)
        subprocess.run(['podman', 'volume', 'rm', '-f', broker.MONGO_VOL], capture_output=True)
        shutil.rmtree(cls.directory)
        for key, value in cls.original.items():
            setattr(broker, key, value)

    def execute(self, queries, **flags):
        prepared = subprocess.run(['bun', '-e',
            "import { prepareMongoResult } from './src/services/execute/mongo-results'; "
            "console.log(prepareMongoResult(await Bun.stdin.json()))"],
            cwd=SOURCE.parent.parent, input=json.dumps(queries).encode(), capture_output=True, check=True)
        return broker.mongo_execute({'queries': [prepared.stdout.decode()], **flags})

    def test_cursor_returns_structured_extended_json(self):
        output = self.execute(['db.people.find({}, {_id:0})'], readOnly=True)
        rows = json.loads(output['response'])
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['name'], 'Alice')
        self.assertEqual(rows[0]['a'], {'$numberInt': '1'})

    def test_cursor_is_fully_materialized_and_handles_variables_comments_and_chaining(self):
        self.execute(['db.people.insertMany(Array.from({length:25}, (_,i)=>({name:String(i),a:i})))'])
        output = self.execute(['const threshold=0', 'db.people.find({a:{$gte:threshold}}, {_id:0}).sort({a:1});; // end'], noReset=True, readOnly=True)
        self.assertEqual(len(json.loads(output['response'])), 27)

    def test_automatic_state_observation_works_without_Test_and_is_trusted(self):
        expected = self.execute(['db.people.updateOne({name:"Alice"}, {$set:{a:3}})'], captureState=True)
        wrong = self.execute(['db.people.updateOne({name:"Bob"}, {$set:{a:3}})'], captureState=True)
        equivalent = self.execute(['db.people.updateOne({name:"Alice"}, {$inc:{a:2}})'], captureState=True)
        def state(output):
            before = json.loads(output['state']['before'])
            after = json.loads(output['state']['after'])
            self.assertNotEqual(before, after)
            return sorted(after['people']['documents'], key=lambda row: row['name'])
        self.assertNotEqual(state(expected), state(wrong))
        comparison = subprocess.run(['bun', '-e',
            "import { sameStateChanges, normalizeMongoSnapshot } from './src/services/state-comparison'; "
            "const states = (await Bun.stdin.json()).map(s => ({...s, before:normalizeMongoSnapshot(s.before), after:normalizeMongoSnapshot(s.after)})); "
            "if (!sameStateChanges(states[0], states[1]) || sameStateChanges(states[0], states[2])) process.exit(1)"],
            cwd=SOURCE.parent.parent, input=json.dumps([expected['state'], equivalent['state'], wrong['state']]).encode(), capture_output=True)
        self.assertEqual(comparison.returncode, 0, comparison.stderr.decode())

    def test_reader_cannot_write_even_through_javascript(self):
        with self.assertRaisesRegex(RuntimeError, 'not authorized|Unauthorized'):
            self.execute(['db.people.updateMany({}, {$set:{name:"Mallory"}})'], readOnly=True)

    def test_write_then_read_only_verification(self):
        self.execute(['db.people.updateMany({}, {$set:{name:"Carol"}})'])
        output = self.execute(['db.people.find({}, {_id:0})'], noReset=True, readOnly=True)
        self.assertEqual([row['name'] for row in json.loads(output['response'])], ['Carol', 'Carol'])


if __name__ == '__main__':
    unittest.main()
