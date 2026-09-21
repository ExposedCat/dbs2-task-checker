# CTU | DBS2 | Task Checker

Monorepo of the DBS2 Task Checker portal: students run Redis / MongoDB queries against
sandbox databases and get graded.

```
web/                    React + Vite frontend (served by Caddy, which also proxies the API)
server/                 Bun + Elysia API
redis-sandbox/          Optional: image running one RediSearch-enabled Redis per student
compose.yaml            web + server, using databases that already run on the host
compose.local-db.yaml   Overlay adding bundled databases (self-contained setup / local testing)
```

## How it fits together

```
browser ──:80/443──> web (Caddy)
                      ├── /        static React bundle
                      └── /api/*   ──> server:8080 (prefix stripped)
                                        ├── portal MongoDB      users, question banks, submissions   (DB_CONNECTION_URL)
                                        ├── sandbox MongoDB     student queries via mongosh, one db + user per student
                                        └── sandbox Redis       student queries, one instance per student on user.port
```

- Only `web` publishes ports: **80** (and 443), so the URL needs no port.
- The frontend is built with `VITE_BASE_API_URL=/api`, i.e. relative to wherever the site is
  served from; nothing host-specific is baked into the bundle.
- The server reaches the databases wherever `.env` says. `host.containers.internal` resolves
  to the host machine, so ports published by other containers on the host work.
- A student's portal password is also their sandbox MongoDB password and the password of the
  `default` user of their Redis instance; `user.port` in the portal is that instance's port.

## Deploying on nosql.felk.cvut.cz

The databases already run there as rootless containers of `yuliia` (`~/infra/README.md`):
`yuliia-mongodb` holds both the `portal` database and the student sandboxes on host port
42222, and every student has a `yuliia-redis-<login>` container on the port registered in
`~/infra/redis/users.json`. Students are provisioned with `sudo ~/scripts/users/users.bash`,
which also creates the portal user. Only `web` and `server` come from this repository.

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
Wants=network-online.target yuliia-mongodb.service yuliia-redis.service
After=network-online.target yuliia-mongodb.service yuliia-redis.service

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

## Self-contained setup (bundled databases)

For a fresh host or local testing, the overlay adds a portal MongoDB, a sandbox MongoDB and
a multi-instance sandbox Redis:

```sh
cp .env.example .env                                              # JWT_SECRET, MONGO_SANDBOX_ROOT_PASSWORD
cp redis-sandbox/instances.example.conf redis-sandbox/instances.conf
# datasets: server/datasets/redis/dataset.txt and server/datasets/mongodb/dataset.js
#           (see server/datasets/README.md)
podman-compose -f compose.yaml -f compose.local-db.yaml up -d --build
```

Users are not self-registered. Each student needs a portal user, a sandbox MongoDB user and
a Redis instance, all with the same password:

```sh
# portal user + sandbox MongoDB user (add --admin for teachers)
podman-compose exec server bun run scripts/create-user.ts --user alice --password s3cret --port 6380
# Redis instance: add "<port>:<password>" to redis-sandbox/instances.conf and restart
echo "6380:s3cret" >> redis-sandbox/instances.conf
podman-compose -f compose.yaml -f compose.local-db.yaml restart redis-sandbox
```

Question banks are uploaded by an admin through the portal UI.

## Configuration (`.env`)

| Variable                      | Default                                    | Description                                                  |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| `JWT_SECRET`                  | –                                          | Secret for signing session tokens. Required.                 |
| `DB_CONNECTION_URL`           | `mongodb://host.containers.internal:27017` | Portal database                                              |
| `MONGO_SANDBOX_HOST` / `_PORT`| `host.containers.internal` / `42222`       | Sandbox MongoDB                                              |
| `REDIS_SANDBOX_HOST`          | `host.containers.internal`                 | Host of the per-student Redis instances                      |
| `DATASETS_DIR`                | `./server/datasets`                        | Runtime datasets, mounted read-only into the server          |
| `PASSWORD_RESET_SSH_TARGET`   | – (disabled)                               | `user@host` for resetting student Linux passwords over SSH; see `server/scripts/host/README.md` |
| `PASSWORD_RESET_SSH_KEY_FILE` | `/dev/null`                                | Private key of the portal for the password reset             |
| `SITE_ADDRESS`                | `:80`                                      | Caddy site address; a domain enables automatic HTTPS         |
| `WEB_HTTP_PORT` / `_HTTPS_PORT` | `80` / `443`                             | Host ports published by `web`                                |
| `MONGO_SANDBOX_ROOT_USERNAME` / `_PASSWORD` | `root` / –                   | Bundled sandbox MongoDB root (overlay only)                  |
| `MONGO_SANDBOX_ROOT_URL`      | –                                          | For `create-user.ts` against an external sandbox MongoDB     |

`docker compose` works the same way as `podman-compose`. Rootless podman needs
`net.ipv4.ip_unprivileged_port_start=80` to bind port 80 (or set `WEB_HTTP_PORT=8080`).

## Local development

`compose.dev.yaml` starts the bundled databases and the API from the working tree with hot
reload (`bun --watch`); the frontend runs on the host with Vite. Nothing but podman/node is
needed on the machine, and everything listens on 127.0.0.1 only.

```sh
podman-compose -f compose.dev.yaml up -d --build                   # DBs + API on http://127.0.0.1:8080
podman-compose -f compose.dev.yaml --profile seed run --rm seed    # sample accounts (once)
cd web && cp .env.example .env && npm install && npm run dev       # http://127.0.0.1:3000
```

Sample accounts created by `seed` (portal + sandbox MongoDB + Redis, all with the same password):

| Login     | Password  | Role    | Redis port |
| --------- | --------- | ------- | ---------- |
| `admin`   | `admin`   | admin   | 6380       |
| `student` | `student` | student | 6381       |

The question banks are empty at first: upload them as `admin` on the Datasets page, or copy
them from an existing deployment. The runtime datasets go to `server/datasets/` (see
`server/datasets/README.md`). Ports: portal MongoDB 27018, sandbox MongoDB 42222
(`root`/`dev`), Redis 6380/6381. `podman-compose -f compose.dev.yaml down -v` wipes everything.

Without containers for the API: `cd server && cp .env.example .env && bun install && bun run dev`
against databases of your own.

See `web/README.md` and `server/README.md` for the per-package tech stack.

## License

This code is licensed under the EUPL-1.2-only license.
