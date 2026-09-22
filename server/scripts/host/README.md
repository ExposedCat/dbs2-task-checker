# Password reset from the portal

The Users page lets an admin "reset" a student's password: the student's **Linux** password is
expired (`passwd -e`), so the student has to choose a new one at the next SSH login. Database passwords are not changed. Portal login uses SSH approval; see [setup](PORTAL-LOGIN.md).

The API runs in a container and cannot touch the host's accounts, so it delegates the operation
over SSH to a forced command on the host. The chain is:

```
API container ──ssh -i <portal key> yuliia@host  <login>──▶  portal-ssh-command  (forced command,
                                                                 validates the login)
                                                          ──▶  sudo -n portal-expire-password <login>
                                                                 (root, sudoers NOPASSWD)
                                                          ──▶  passwd -e <login>
```

Every step re-validates the login against `^f[0-9]{2}_[a-z0-9_]{1,43}$`, the pattern of the
provisioning scripts, so the key cannot be used against any other account.

## Install on the host (once)

As the infrastructure user (`yuliia`):

```sh
cd ~/infra/portal
mkdir -p -m 700 secrets
ssh-keygen -t ed25519 -N '' -C portal-password-reset -f secrets/portal_ssh_key
install -m 755 server/scripts/host/portal-ssh-command ~/infra/bin/portal-ssh-command
printf 'restrict,command="%s" %s\n' "$HOME/infra/bin/portal-ssh-command" "$(cat secrets/portal_ssh_key.pub)" >> ~/.ssh/authorized_keys
```

As root (the only step that needs it):

```sh
install -o root -g root -m 755 server/scripts/host/portal-expire-password /usr/local/libexec/portal-expire-password
install -o root -g root -m 440 server/scripts/host/portal-expire-password.sudoers /etc/sudoers.d/portal-expire-password
visudo -c
```

Then in `.env`:

```
PASSWORD_RESET_SSH_TARGET=yuliia@host.containers.internal
PASSWORD_RESET_SSH_KEY_FILE=./secrets/portal_ssh_key
```

and `podman-compose up -d --build` (the image needs `openssh-client`).

## Check

From the host, the same call the container makes:

```sh
ssh -i secrets/portal_ssh_key -o BatchMode=yes yuliia@127.0.0.1 f26_student
# -> Password of f26_student expired: a new one must be set at the next login
```

Anything else is refused by the forced command (`ssh -i secrets/portal_ssh_key yuliia@127.0.0.1 ls`
→ `refused: 'ls' is not a student login`).

## Account deletion from the Users page

The Delete button confirms the exact login and uses the same SSH key/target with
`delete fYY_login`. While it runs, all buttons for that login are disabled and row
text is red. The button is icon-only; successfully deleted rows disappear. Multiple
selections queue in the browser, and host removals wait for the provisioning lock.
Errors allow retrying. `~/scripts/users/users.bash remove -` removes the Linux
account, home and database resources, then deletes all portal records (including
submissions and legacy duplicates) for the exact login.

Update the existing provisioning scripts as `yuliia` before deploying the portal:

```sh
python3 server/scripts/host/update-user-deletion.py
```

The updater checks the expected source before changing any files, keeps backups
with the `.before-portal-deletion` suffix, and can safely be run again. It adds
`mongo-admin portal-remove`, calls it only after account cleanup succeeds, and
makes removals wait for the global lock. It does not delete any accounts itself.

Update the forced command as the infrastructure user:

```sh
install -m 755 server/scripts/host/portal-ssh-command ~/infra/bin/portal-ssh-command
```

Install the deletion helper as root:

```sh
install -o root -g root -m 755 server/scripts/host/portal-delete-user /usr/local/libexec/portal-delete-user
install -o root -g root -m 440 server/scripts/host/portal-delete-user.sudoers /etc/sudoers.d/portal-delete-user
visudo -c
install -o root -g root -m 600 /dev/null /etc/portal-delete-user.env
```

Populate `/etc/portal-delete-user.env` with shell-quoted `ADMIN_PASSWORD='…'` on the
unified-credential host. Otherwise set `POSTGRES_ADMIN_PASSWORD`,
`MONGO_ADMIN_PASSWORD`, `CASSANDRA_ADMIN_PASSWORD`, and `NEO4J_ADMIN_PASSWORD`.
Keep these credentials on the host. The helper exports them so provisioning does
not prompt for a terminal. It passes `USERS_FULL_NAMES=1` and exactly one validated
login on stdin, including when deleting an account from an earlier year.

Rebuild the portal after installing the helpers. No accounts are deleted during
installation. The provisioning script takes its existing global lock and can
leave partially completed removals on failure; check host logs before retrying.

## Account creation from the Users page

The plus button accepts multiple name/password rows and a TXT file containing
`name:password` lines (blank lines and `#` comments are ignored). Short names gain
the current `fYY_` prefix; full student logins retain their prefix. The API validates
the whole batch and creates the portal records with `created: false` before queuing
host provisioning. It marks each record `created: true` and saves its Redis port
only after that account succeeds. Existing records are migrated to `created: true`.

While pending, rows are green and account buttons are disabled; the list polls for
completion. Failed accounts retain an error. Retry through the plus popup with the
same login and password. Passwords remain in memory only and travel over SSH stdin;
they are never saved in portal records. Restarting the API interrupts its queue;
unfinished accounts can be retried with the same password. Pending accounts cannot
log in, and bulk deletion excludes them.

As `yuliia`, apply the provisioning update after the deletion update above:

```sh
python3 server/scripts/host/update-user-creation.py
install -m 755 server/scripts/host/portal-ssh-command ~/infra/bin/portal-ssh-command
```

This removes portal creation from `users.bash`, its CRUD helper, and `mongo-admin`;
the host now creates only infrastructure. Both create and remove wait for the same
provisioning lock. The updater keeps `.before-portal-creation` backups and is
idempotent. Once applied, do not rerun the older deletion updater.

As root, install the new forced-command helper and sudo rule:

```sh
install -o root -g root -m 755 server/scripts/host/portal-create-user /usr/local/libexec/portal-create-user
install -o root -g root -m 440 server/scripts/host/portal-create-user.sudoers /etc/sudoers.d/portal-create-user
visudo -c
```

Creation uses the same root-owned `/etc/portal-delete-user.env` credentials and
SSH key as deletion. The helper accepts one validated full login, one password
line on stdin, and returns the assigned Redis port after successful provisioning.
