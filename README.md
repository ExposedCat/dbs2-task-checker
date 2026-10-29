# CTU | DBS2 | Task Checker

Monorepo of the DBS2 Task Checker portal: students run Redis / MongoDB queries against
isolated grading databases and get graded. Student passwords are not stored.

```
web/                    React + Vite frontend (served by Caddy, which also proxies the API)
server/                 Bun + Elysia API
redis-sandbox/          Optional: image running one RediSearch-enabled Redis per student
compose.yaml            web + server + grading services, using a portal database on the host
compose.local-db.yaml   Overlay adding the portal database
compose.dev.yaml        Complete local stack with hot reload and a forced development user
```

## How it fits together

```
browser ──:80/443──> web (Caddy)
                      ├── /        static React bundle
                      └── /api/*   ──> server:8080 (prefix stripped)
                                        ├── portal MongoDB      users, question banks, submissions   (DB_CONNECTION_URL)
                                        ├── MongoDB executor    client processes, separate database per grading attempt
                                        └── grading Redis       private Compose service, reset per job
```

- In `compose.yaml`, only `web` publishes ports: **80** (and 443), so the URL needs no port.
- The frontend is built with `VITE_BASE_API_URL=/api`, i.e. relative to wherever the site is
  served from; nothing host-specific is baked into the bundle.
- The server reaches the databases wherever `.env` says. `host.containers.internal` resolves
  to the host machine, so ports published by other containers on the host work.
- Browser login uses SSH code approval. Grading uses isolated shared databases and needs no
  student password. Reference results are cached across students. Personal database ports
  remain metadata for the admin Services page.

## Portal database and accounts

The optional `compose.local-db.yaml` overlay adds a portal MongoDB. Both database configurations
include the [Compose grading services](server/scripts/grading/README.md).
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

For production, copy `.env.example` to `.env` and set the JWT and grading database secrets.
Development Compose supplies local defaults and needs no `.env` file.

| Variable                      | Default                                    | Description                                                  |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| `FORCE_USER`                 | `student` (development Compose)             | `student` or `admin` to skip authentication in development; ignored in production |
| `GRADING_MONGO_PASSWORD` / `GRADING_REDIS_PASSWORD` | Development defaults only | Required production secrets for the private grading services |
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

For rootless Podman, set `WEB_HTTP_PORT=8080` if binding port 80 is unavailable.

## Local development

The stack supports **Docker Compose** and **Podman Compose**. All grading services start
with Compose; no host grading broker, container-engine socket, or external volumes are needed.
Runtime datasets belong in `server/datasets/`.

`compose.dev.yaml` starts the frontend, API, portal MongoDB and grading services. Node, npm and Bun run
inside the containers; you do not need them installed locally. Frontend and API source
changes reload automatically. Start the development stack with:

```sh
docker compose -f compose.dev.yaml up -d --build
```

Or with Podman:

```sh
podman-compose -f compose.dev.yaml up -d --build
```

Open **http://127.0.0.1:3000** in your browser after Compose starts. The frontend
forwards `/api` requests to the API container automatically. No separate frontend command
or `web/.env` setup is needed.

Authentication is skipped locally using `FORCE_USER`, which defaults to `student` in
`compose.dev.yaml`. The selected demo account is created automatically. To test as admin:

```sh
FORCE_USER=admin docker compose -f compose.dev.yaml up -d
```

Refresh the browser after changing accounts. Use `FORCE_USER=student` to switch back.
This override applies only with `NODE_ENV=development`; production uses SSH code approval.
Use `podman-compose` in the account-switch command when running Podman.

See `web/README.md` and `server/README.md` for package details.

## License

This code is licensed under the EUPL-1.2-only license.
