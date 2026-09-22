#!/usr/bin/env python3
"""Update existing host provisioning scripts without running account operations."""
from pathlib import Path
import shutil
import tempfile


def update(root: Path):
    changes = {
        root / 'scripts/users/users.bash': [
            ("flock -n 9 || { echo 'Another provisioning process is running' >&2; exit 1; }",
             "# Removals queue behind provisioning instead of failing on concurrent requests.\n"
             "if [[ $ACTION == remove ]]; then\n  flock 9\nelse\n"
             "  flock -n 9 || { echo 'Another provisioning process is running' >&2; exit 1; }\nfi"),
            ('    # Preserve portal users/submissions, consistent with the previous script.\n', ''),
            ('    if getent passwd "$USER_NAME" >/dev/null; then userdel -r "$USER_NAME"; fi\n',
             '    if getent passwd "$USER_NAME" >/dev/null; then userdel -r "$USER_NAME"; fi\n'
             '    # Keep the portal row available for retry until all account cleanup succeeds.\n'
             '    remove_portal_user\n'),
        ],
        root / 'scripts/users/utils/crud.bash': [
            ('create_portal_user() {',
             'remove_portal_user() { infra_owner /home/yuliia/infra/bin/mongo-admin portal-remove "$USER_NAME"; }\n'
             'create_portal_user() {'),
        ],
        root / 'infra/bin/mongo-admin.ts': [
            ("  } else if (action === 'portal') {",
             "  } else if (action === 'portal-remove') {\n"
             "    // Delete every legacy duplicate for this exact validated login.\n"
             "    await client.db('portal').collection('users').deleteMany({ user });\n"
             "  } else if (action === 'portal') {"),
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
    for path, text in reversed(prepared):
        backup = path.with_name(path.name + '.before-portal-deletion')
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
