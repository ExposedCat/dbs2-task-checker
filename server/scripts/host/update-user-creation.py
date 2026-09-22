#!/usr/bin/env python3
"""Move portal record creation out of the host script; does not create accounts."""
from pathlib import Path
import shutil
import tempfile


def update(root: Path):
    changes = {
        root / 'scripts/users/users.bash': [
            ("# Removals queue behind provisioning instead of failing on concurrent requests.\n"
             "if [[ $ACTION == remove ]]; then\n  flock 9\nelse\n"
             "  flock -n 9 || { echo 'Another provisioning process is running' >&2; exit 1; }\nfi",
             '# Queue all provisioning operations behind the same host lock.\nflock 9'),
            ('    create_portal_user\n', ''),
        ],
        root / 'scripts/users/utils/crud.bash': [
            ('create_portal_user() {\n  local port\n'
             '  port=$(infra_owner /home/yuliia/infra/redis/manage port "$USER_NAME")\n'
             '  infra_owner /home/yuliia/infra/bin/mongo-admin portal "$USER_NAME" "$port"\n}\n', ''),
        ],
        root / 'infra/bin/mongo-admin.ts': [
            ("  } else if (action === 'portal') {\n"
             '    const port = Number(portArg);\n'
             "    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Missing valid Redis port');\n"
             "    const users = client.db('portal').collection('users');\n"
             "    if (await users.countDocuments({user}) > 1) throw new Error('Duplicate portal username needs reconciliation');\n"
             '    await users.updateOne({user}, {$set:{port}, $unset:{password:""}, $setOnInsert:{submissions:[],testSession:null,admin:false}}, {upsert:true});\n', ''),
            ('const [action, user, portArg]', 'const [action, user]'),
        ],
    }
    prepared = []
    for path, replacements in changes.items():
        original = text = path.read_text()
        for before, after in replacements:
            if after and after in text:
                continue
            if not after and before not in text:
                continue
            if text.count(before) != 1:
                raise RuntimeError(f'Unexpected contents in {path}; no files changed')
            text = text.replace(before, after, 1)
        if text != original:
            prepared.append((path, text))
    for path, text in prepared:
        backup = path.with_name(path.name + '.before-portal-creation')
        if not backup.exists():
            shutil.copy2(path, backup)
        with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as staged:
            staged.write(text)
        staged_path = Path(staged.name)
        shutil.copystat(path, staged_path)
        staged_path.replace(path)
        print(f'Updated {path}')
    if not prepared:
        print('Provisioning scripts are already updated')


if __name__ == '__main__':
    update(Path('/home/yuliia'))
