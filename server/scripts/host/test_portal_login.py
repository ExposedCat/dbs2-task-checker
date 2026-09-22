import importlib.machinery
import importlib.util
import io
import json
import pathlib
import types
import unittest
from unittest.mock import patch, mock_open, MagicMock

path = pathlib.Path(__file__).with_name('portal-login-approve')
loader = importlib.machinery.SourceFileLoader('portal_login_helper', str(path))
spec = importlib.util.spec_from_loader(loader.name, loader)
helper = importlib.util.module_from_spec(spec)
loader.exec_module(helper)


class IdentityTests(unittest.TestCase):
    def test_requires_sudo_identity(self):
        with patch.object(helper.os, 'geteuid', return_value=1000):
            with self.assertRaisesRegex(ValueError, 'own SSH account'):
                helper.main()

    def test_does_not_accept_username_argument(self):
        with patch.object(helper.os, 'geteuid', return_value=0), \
             patch.dict(helper.os.environ, {'SUDO_UID': '1000'}, clear=True), \
             patch.object(helper.pwd, 'getpwuid', return_value=types.SimpleNamespace(pw_name='student')), \
             patch.object(helper.sys, 'argv', ['portal-login', 'AAAA-BBBB-CCCC-DDDD', 'admin']):
            with self.assertRaisesRegex(ValueError, 'Usage'):
                helper.main()

    def test_ignores_forged_user_environment_and_uses_uid(self):
        connection = MagicMock()
        connection.getresponse.return_value.status = 200
        connection.getresponse.return_value.read.return_value = b'{"ok":true}'
        with patch.object(helper.os, 'geteuid', return_value=0), \
             patch.dict(helper.os.environ, {'SUDO_UID': '1000', 'USER': 'admin', 'LOGNAME': 'admin'}, clear=True), \
             patch.object(helper.pwd, 'getpwuid', return_value=types.SimpleNamespace(pw_name='student')), \
             patch.object(helper.sys, 'argv', ['portal-login', 'AAAA-BBBB-CCCC-DDDD']), \
             patch.object(helper.os, 'stat', return_value=types.SimpleNamespace(st_uid=0, st_mode=0o600)), \
             patch('builtins.open', mock_open(read_data='{"socket":"/private/login.sock"}')), \
             patch.object(helper.socket, 'socket'), \
             patch.object(helper.http.client, 'HTTPConnection', return_value=connection), \
             patch.object(helper.sys, 'stdout', new_callable=io.StringIO):
            helper.main()
        self.assertEqual(json.loads(connection.request.call_args.args[2])['login'], 'student')


if __name__ == '__main__':
    unittest.main()
