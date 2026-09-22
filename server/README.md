# CTU | DBS2 | Task Checker (Server)

## Description

This package is an API backend for the Task Checker application

## Tech Stack

- Language: **TypeScript (JavaScript)**
- Runtime: **Bun**
- Framework: **Elysia.JS**
- Runtime type validation: **TypeBox** (part of the framework)
- Database: **MongoDB**
- DB Drivers: **redis**

## License

This code is licensed under the EUPL-1.2-only license

## Execution and login

See [private grading deployment](scripts/grading/README.md) and
[SSH code login](scripts/host/PORTAL-LOGIN.md). No student passwords are stored or used.
MongoDB submissions execute in disposable containers; Redis uses a private shared socket.
Personal student databases are independent of grading.

## Query resource limits

The API accepts 100 commands, 16,384 characters per command, 64 KiB total command text,
and a 1 MiB request body. One complete grading job runs at a time, with up to 16 waiting
jobs and a 120-second queue wait limit. There is no per-user or multi-tab lock.
One API process is supported; multiple replicas require a shared queue.

MongoDB invocations have a 20-second deadline and 1 MiB stdout/stderr budget. Redis has a
15-second deadline and 1 MiB result budget after reply decoding. A cold reference with a
verification query can require four invocations. Failed/timed-out MongoDB operations
recreate its grading instance; Redis timeouts/transport failures restart Redis before
returning. The API has 2 CPUs/1 GiB/128 processes; grading containers have separate limits.

## Reference result cache

The portal MongoDB `referenceCache` collection stores successful reference and optional
verification outputs. A miss computes the reference on a freshly loaded dataset and saves
it; a hit reuses it. Student execution always resets/loads independently afterwards.
Failed references are not cached; skipped submissions do not compute references.

Keys hash dataset ID, runtime dataset contents, session solution and verification query,
`REFERENCE_CACHE_VERSION`, and a fixed shared grading scope. Results are shared across users.
Existing sessions retain their task snapshots. Dataset changes during grading reject the
operation. Entries expire after 30 days, enforced during lookup and by a MongoDB TTL index.
Bump `REFERENCE_CACHE_VERSION` for engine/module versions or grading semantic changes.
References must be deterministic: time, random/generated IDs and unspecified ordering need
exercise-specific normalization. Cache storage is never accessible to submission containers.

Tests: `bun test src/services/execute/limits.test.ts src/services/reference-cache.test.ts
src/services/grading-cache.test.ts src/services/portal-login.test.ts`.
Redis integration requires `RUN_REDIS_INTEGRATION=1` and `REDIS_GRADING_SOCKET` pointing at
a disposable Redis Stack socket with the grading ACL, plus a disposable grading broker for
restart recovery. Never run it against the live grading instance. Reference persistence integration requires `TEST_REFERENCE_DB`
pointing at a disposable MongoDB (writes its `portal` database).
