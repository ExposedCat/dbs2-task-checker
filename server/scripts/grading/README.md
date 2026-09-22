# Private grading and SSH login

The host broker runs as the infrastructure owner, using rootless Podman. It manages one
always-running MongoDB and one Redis Stack instance, neither with networking or published
ports. The portal API serializes the complete reference/student grading flow. Do not run
multiple API replicas without replacing that queue with a shared queue.

MongoDB uses a single `grading` database. Every reset kills abandoned grader operations,
drops that database, and loads the trusted dataset. Each mongosh invocation runs in a
new disposable container with no network, portal files, API environment, or host sockets
except its private MongoDB socket. A random restricted `readWrite` credential is passed on
stdin; it lives only in broker memory and MongoDB's temporary storage. The root credential
never reaches submitted code. MongoDB authentication prevents instance administration.

Redis uses a private Unix socket with no password. Its ACL denies administrative commands
and migration. It loads Search and JSON modules only. Reset removes indexes, data, scripts,
and functions before loading the dataset. Timeouts/transport failures restart the instance
before another job can begin. Containers bound CPU, memory and processes; MongoDB output
is capped at 1 MiB, Redis output at 1 MiB per execution (after reply decoding).

## Install as the infrastructure owner

Requires Linux, Python 3 and rootless Podman. On the deployed host the owner is `yuliia`.
Copy `broker.py`, `bootstrap.cjs`, and `portal-login` here to `~/infra/grading`, mode 0700
for the directory. `bootstrap.cjs` must be mode 0644 for the disposable container user.
Create `~/infra/grading/control` mode 0755 and `~/infra/portal/run` mode 0700, with
`~/infra/portal/run/login` mode 0777 inside it. Parent directory privacy is essential:
the inner approval socket allows the container UID and host broker to communicate.
Only mount that inner directory into the trusted API.

Create `~/infra/grading/config.json` (no credentials):

```json
{
  "mongoImage": "localhost/yuliia-mongodb:8.3.11",
  "redisImage": "docker.io/redis/redis-stack-server:7.4.0-v8",
  "dataset": "/home/yuliia/infra/portal/server/datasets/mongodb/dataset.js",
  "approvalSocket": "/home/yuliia/infra/portal/run/login/approve.sock",
  "loginSocket": "/var/tmp/dbs-portal-login-1001/login.sock",
  "accounts": { "yuliia": "admin" }
}
```

Use images available to this owner, pinned to reviewed releases. Copy `runner.service` to
`~/.config/systemd/user/dbs-grading.service`, then:

```sh
systemctl --user daemon-reload
systemctl --user enable --now dbs-grading.service
```

The broker creates external socket volumes `dbs-grading-mongo-socket` and
`dbs-grading-redis-socket`. Its startup recreates both databases; grading data is disposable.
Set in the portal `.env`:

```dotenv
GRADING_CONTROL_DIR=/home/yuliia/infra/grading/control
PORTAL_LOGIN_DIR=./run/login
PORTAL_LOGIN_COMMAND=portal-login
REFERENCE_CACHE_VERSION=shared-mongo8.3.11-redis7.4.7-v1
```

Start the broker before `podman-compose up -d --build`. Add `dbs-grading.service` to the
portal systemd unit's Wants/After. The broker restarts after failure and on user service
startup; enable lingering for this owner using the host's normal administration process.
The broker executes only trusted Podman arguments; never expose its private control socket
or mount it into submission containers.

## Login and migration

The broker installs its socket client alongside `login.sock`. Install the command wrapper
once into the system PATH (requires administrator access to `/usr/local/bin`):

```sh
sudo install -o root -g root -m 0755 server/scripts/grading/portal-login-command /usr/local/bin/portal-login
```

Verify `command -v portal-login` from a student SSH session, then set
`PORTAL_LOGIN_COMMAND=portal-login` and recreate the API container. Students run
`portal-login CODE` with no sudo, SSH tunnel or account password. The wrapper preserves
the calling user's UID; `/var/tmp` is only the internal broker socket/client location. The kernel supplies the SSH
process's UID using SO_PEERCRED. Clients submit only a code, never a claimed username.
An optional operator-owned mapping maps host accounts to portal logins. All other accounts
map by exact login and must already exist in the portal database.

After verifying live SSH login and grading, remove `password` from portal user records with
`$unset`. `scripts/create-user.ts --user alice` creates only the portal identity, without
credentials; `--port` retains optional personal Redis metadata and `--admin` grants admin.
Production `~/infra/bin/mongo-admin.ts`'s `portal` action must also unset the field and
`~/scripts/users/utils/crud.bash` must not pass a password to that action. Other provisioning
steps may still need passwords to create independent Linux/personal database accounts.

The portal retains its service DB connection credential, JWT signing secret and optional
password-reset SSH key. These are operator secrets, not student passwords. Historical
backups and personal database credentials are not deleted by the portal migration.
