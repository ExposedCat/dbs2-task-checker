# CTU | DBS2 | Task Checker

Monorepo of the DBS2 Task Checker portal: students run Redis / MongoDB queries against
isolated shared grading databases and get graded. Student passwords are not stored.

```
web/                    React + Vite frontend (served by Caddy, which also proxies the API)
server/                 Bun + Elysia API
redis-sandbox/          Optional: image running one RediSearch-enabled Redis per student
compose.yaml            web + server, using databases that already run on the host
compose.local-db.yaml   Overlay adding the portal database; host grading broker still required
```

## How it fits together

```
browser ──:80/443──> web (Caddy)
                      ├── /        static React bundle
                      └── /api/*   ──> server:8080 (prefix stripped)
                                        ├── portal MongoDB      users, question banks, submissions   (DB_CONNECTION_URL)
                                        ├── grading broker      disposable mongosh containers, shared private MongoDB
                                        └── grading Redis       shared private Unix socket, reset per job
```

- Only `web` publishes ports: **80** (and 443), so the URL needs no port.
- The frontend is built with `VITE_BASE_API_URL=/api`, i.e. relative to wherever the site is
  served from; nothing host-specific is baked into the bundle.
- The server reaches the databases wherever `.env` says. `host.containers.internal` resolves
  to the host machine, so ports published by other containers on the host work.
- Browser login uses SSH code approval. Grading uses isolated shared databases and needs no
  student password. Reference results are cached across students. Personal database ports
  remain metadata for the admin Services page.

## Deploying on nosql.felk.cvut.cz

The databases already run there as rootless containers of `yuliia` (`~/infra/README.md`):
`yuliia-mongodb` holds both the `portal` database and the student sandboxes on host port
42222, and every student has a `yuliia-redis-<login>` container on the port registered in
`~/infra/redis/users.json`. Students are provisioned with `sudo ~/scripts/users/users.bash`,
which also creates the portal user. The separate grading broker and private databases live in `~/infra/grading`.
Install them first using [the broker guide](server/scripts/grading/README.md).

One-time, as root:

```sh
# let rootless podman bind ports 80/443 (everything keeps running as yuliia)
sysctl net.ipv4.ip_unprivileged_port_start=80
echo 'net.ipv4.ip_unprivileged_port_start=80' > /etc/sysctl.d/99-unprivileged-ports.conf
# 80/443 are currently filtered by ufw
ufw allow 80/tcp comment 'Portal HTTP'
ufw allow 443/tcp comment 'Portal HTTPS'
```

As `yuliia`, the portal lives in `~/infra/portal` next to the other services:

```sh
git clone https://github.com/ExposedCat/dbs2-task-checker.git ~/infra/portal && cd ~/infra/portal
cp .env.example .env
#   JWT_SECRET         the existing one (keeps sessions valid)
#   DB_CONNECTION_URL  mongodb://admin:<password>@host.containers.internal:42222
# runtime datasets go to server/datasets/ (git-ignored)
~/infra-tools/compose-venv/bin/podman-compose up -d --build
curl -s http://127.0.0.1/api/session          # -> {"ok":false,...,"error":"Unauthorized"}
```

`~/infra/bin/mongo-admin.ts` (used by student provisioning) imports the MongoDB driver from
`~/infra/portal/server/node_modules`, so keep `bun install --frozen-lockfile` run in
`server/` after pulling a change to its dependencies.

Autostart, in the same style as the other infra units (`~/.config/systemd/user/dbs2-portal.service`):

```ini
[Unit]
Description=DBS2 task checker portal
Wants=network-online.target yuliia-mongodb.service dbs-grading.service
After=network-online.target yuliia-mongodb.service dbs-grading.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=%h/infra/portal
ExecStart=%h/infra-tools/compose-venv/bin/podman-compose up -d
ExecStop=%h/infra-tools/compose-venv/bin/podman-compose stop
TimeoutStartSec=300
TimeoutStopSec=180

[Install]
WantedBy=default.target
```

```sh
systemctl --user daemon-reload && systemctl --user enable --now dbs2-portal
```

Updating: `git pull && podman-compose up -d --build`.

Optional HTTPS: set `SITE_ADDRESS=nosql.felk.cvut.cz` in `.env` and `podman-compose up -d`.
Caddy obtains and renews a Let's Encrypt certificate and redirects HTTP to HTTPS; this needs
80 and 443 reachable from the internet.

## Portal database and accounts

The optional `compose.local-db.yaml` overlay adds a portal MongoDB. Both deployment modes
require the separate [host grading broker](server/scripts/grading/README.md).
Runtime datasets go in `server/datasets/`; admins upload question banks through the UI.

```sh
podman-compose -f compose.yaml -f compose.local-db.yaml up -d --build
podman-compose exec server bun run scripts/create-user.ts --user alice
```

Add `--admin` for teachers. `--port` is optional metadata for a student's personal Redis.
Accounts need a matching SSH login (or an operator-owned mapping). Browser login uses the
displayed `portal-login CODE` command; no password fallback or SSH tunnel is needed.
See [SSH login](server/scripts/host/PORTAL-LOGIN.md) for transport limitations.

## Configuration (`.env`)

| Variable                      | Default                                    | Description                                                  |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| `JWT_SECRET`                  | –                                          | Secret for signing session tokens. Required.                 |
| `DB_CONNECTION_URL`           | `mongodb://host.containers.internal:27017` | Portal database                                              |
| `MONGO_SANDBOX_HOST` / `_PORT`| `host.containers.internal` / `42222`       | Personal MongoDB monitoring only                             |
| `REDIS_SANDBOX_HOST`          | `host.containers.internal`                 | Personal Redis monitoring only                               |
| `DATASETS_DIR`                | `./server/datasets`                        | Runtime datasets, mounted read-only into the server          |
| `PASSWORD_RESET_SSH_TARGET`   | – (disabled)                               | `user@host` for resetting student Linux passwords over SSH; see `server/scripts/host/README.md` |
| `PASSWORD_RESET_SSH_KEY_FILE` | `/dev/null`                                | Private key of the portal for the password reset             |
| `INFRA_SERVICES`              | –                                          | Extra endpoints for the admin Services page: `Name=tcp://host:port,Name=http://host:port/` |
| `SITE_ADDRESS`                | `:80`                                      | Caddy site address; a domain enables automatic HTTPS         |
| `WEB_HTTP_PORT` / `_HTTPS_PORT` | `80` / `443`                             | Host ports published by `web`                                |

`docker compose` works the same way as `podman-compose`. Rootless podman needs
`net.ipv4.ip_unprivileged_port_start=80` to bind port 80 (or set `WEB_HTTP_PORT=8080`).

## Local development

Start/configure the host broker as described in its guide. `compose.dev.yaml` starts a
portal MongoDB and the API with hot reload, mounting the broker and login sockets just as
production does. The frontend runs separately with Vite.

```sh
podman-compose -f compose.dev.yaml up -d --build
podman-compose -f compose.dev.yaml --profile seed run --rm seed
cd web && npm install && npm run dev
```

Seed creates passwordless portal identities `admin` and `student`; map your local SSH
account in broker config to one of these. Upload question banks as admin and provide the
runtime datasets. No sample database passwords are stored by the portal.

See `web/README.md` and `server/README.md` for package details.

## License

This code is licensed under the EUPL-1.2-only license.
