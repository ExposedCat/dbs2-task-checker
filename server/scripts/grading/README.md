# Compose grading services and SSH login

Both `compose.yaml` and `compose.dev.yaml` start the grading services themselves:

- `grading-mongo`: one pre-started MongoDB container, separate from portal storage.
- `mongo-executor`: a pre-started service that launches `mongosh` processes, not containers.
- `grading-redis`: one pre-started Redis Stack service, on a private network.

No Docker/Podman CLI, engine socket, external named volume, or host grading daemon is needed.
Docker Compose and Podman Compose use the same configuration. Start development with:

```sh
docker compose -f compose.dev.yaml up -d --build
# Or: podman-compose -f compose.dev.yaml up -d --build
```

## MongoDB execution

Each grading attempt gets a unique internal database and random writer/reader credentials
restricted to that database. Reference, student solution and existing `Test` execute in
that scope; each reference/student run reloads its own dataset. Other sessions have separate
databases and can execute independently. Requests from the same user/session serialize in
the API. The execution service handles up to four concurrent requests and 16 workspaces.

The API removes the database and credentials when the attempt finishes, including errors.
The executor also reaps idle workspaces after three minutes and clears abandoned grading
databases/users after a restart. Failed queries kill only that scope's operations. It does
not restart MongoDB or disturb other users' databases. Internal database names in outputs
are normalized to the logical name `grading` so reference caching remains stable.

Submitted JavaScript runs as a separate unprivileged OS identity for each active client
process, with a private temporary directory and a clean environment. The supervisor keeps
the MongoDB administrator password; submitted processes receive only their scope's writer
or reader credential on stdin. Processes cannot read the root supervisor environment or
access the API control socket. After execution, all processes with that identity are killed
before it can be reused. The service has a read-only root filesystem, restricted Linux
capabilities, no privilege escalation, CPU/memory/process limits, and no network access to
the API, portal database or Redis. Child processes have additional CPU, process, file-size
and file-descriptor limits. This uses Linux process/user isolation within a persistent
container; it does not provide a separate container boundary for each submitted program.

Each execution has a 20-second deadline and a 1 MiB output budget per client process.
Trusted state observations use a separate client process with read-only database credentials.
They capture collection data/options/indexes for automatic write grading without editing
existing question banks or runtime datasets. The API uses protocol 3 canonical Extended JSON.

## Redis execution

Redis retains serialized grading because Search indexes require database zero. The API
resets indexes, data, scripts and functions before loading each job's dataset. The default
ACL denies administration and migration. An administrator credential held only by the API
allows recovery with `SHUTDOWN NOSAVE`; Compose's restart policy restarts Redis, and the
API waits for readiness before releasing the grading slot. Redis publishes no host ports.

## Production configuration

Set `GRADING_MONGO_PASSWORD` and `GRADING_REDIS_PASSWORD` in `.env` (use separate random
secrets). Development Compose supplies local defaults. Grading MongoDB data is disposable
and stored in a bounded tmpfs, recreated on container restart. Portal storage stays persistent;
existing portal records and runtime datasets are unchanged.

## Optional host SSH approval

Development uses `FORCE_USER` and needs no host helper. Production SSH identity approval
still runs on the SSH host, where the kernel can supply the real caller UID. This helper
only approves login codes; it starts no databases or containers and needs no container runtime.

Copy `broker.py` and `portal-login` into an operator-owned directory such as `~/infra/grading`.
Create `config.json` there with the API approval socket, public SSH socket and optional mappings:

```json
{
  "approvalSocket": "/absolute/path/to/project/run/login/approve.sock",
  "loginSocket": "/var/tmp/dbs-portal-login-1001/login.sock",
  "accounts": { "local_operator": "admin" }
}
```

Keep the helper directory/configuration writable only by its owner. The public socket's
parent must also be owner-controlled and not group/world writable. Create `run/login` for
the API to write its approval socket; point `PORTAL_LOGIN_DIR` at that directory. Run
`python3 -I broker.py`, or install `runner.service` as a user service after adjusting its
working directory. No helper is needed for local `FORCE_USER` authentication.

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
Production `scripts/mongo-admin.ts`'s `portal` action must also unset the field and
`the account provisioning scripts` must not pass a password to that action. Other provisioning
steps may still need passwords to create independent Linux/personal database accounts.

The portal retains its service DB connection credential, JWT signing secret and optional
password-reset SSH key. These are operator secrets, not student passwords. Historical
backups and personal database credentials are not deleted by the portal migration.
