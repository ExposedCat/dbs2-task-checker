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
