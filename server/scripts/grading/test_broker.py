"""The optional SSH approval broker never starts containers or grading databases."""
import importlib.util
import pathlib
import unittest
from unittest.mock import patch, Mock

SOURCE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('login_broker', SOURCE / 'broker.py')
broker = importlib.util.module_from_spec(spec)
with patch.object(pathlib.Path, 'read_text', return_value='{}'):
    spec.loader.exec_module(broker)


class LoginBrokerTests(unittest.TestCase):
    def test_kernel_identity_is_mapped_and_forwarded_to_private_approval(self):
        response = Mock(status=200)
        response.read.return_value = b'{"ok":true}'
        with patch.dict(broker.CONFIG, {'accounts': {'local': 'admin'}, 'approvalSocket': '/unused'}), \
                patch.object(broker.pwd, 'getpwuid', return_value=Mock(pw_name='local')), \
                patch.object(broker.http.client, 'HTTPConnection') as connection, \
                patch.object(broker.socket, 'socket'):
            connection.return_value.getresponse.return_value = response
            self.assertEqual(broker.approval('CODE', 1000), {'login': 'admin'})
            self.assertIn('"login": "admin"', connection.return_value.request.call_args.args[2])


if __name__ == '__main__':
    unittest.main()
