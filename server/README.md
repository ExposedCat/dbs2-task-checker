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

See [Compose grading services](scripts/grading/README.md) and
[SSH code login](scripts/host/PORTAL-LOGIN.md). No student passwords are stored or used.
MongoDB submissions execute as restricted processes in a persistent Compose service, using
a separate database and credentials per grading attempt. Redis uses a private Compose network.
Personal student databases are independent of grading.

## Query resource limits

The API accepts 100 commands, 16,384 characters per command, 64 KiB total command text,
and a 1 MiB request body. Redis grading jobs serialize through one queue, with up to 16
waiting jobs and a 120-second queue wait limit. MongoDB jobs serialize per user/session,
while different sessions can execute independently (up to four executor requests at once).
One API process is supported; multiple replicas require a shared queue.

Each MongoDB job has a shared 20-second deadline; each shell has a 1 MiB stdout/stderr
budget. Automatic state observation adds trusted before/after shells under that deadline.
Redis has a 15-second deadline and 1 MiB budgets for replies and each state observation.
A cold grade runs both reference and student jobs plus any existing verification queries. Failed/timed-out MongoDB operations
remove only their own database and credentials; Redis timeouts/transport failures restart Redis before
returning. The API has 2 CPUs/1 GiB/128 processes; grading containers have separate limits.

## Reference result cache

The portal MongoDB `referenceCache` collection stores successful reference and optional
verification outputs. A miss computes the reference on a freshly loaded dataset and saves
it; a hit reuses it. Student execution always resets/loads independently afterwards.
Failed references are not cached; skipped submissions do not compute references.

Keys hash dataset ID, runtime dataset contents, session solution and verification query,
`REFERENCE_CACHE_VERSION`, and a fixed logical grading scope. Results are shared across users.
Existing sessions retain their task snapshots. Dataset changes during grading reject the
operation. Entries expire after 30 days, enforced during lookup and by a MongoDB TTL index.
Bump `REFERENCE_CACHE_VERSION` for engine/module versions or grading semantic changes.
Engine adapters normalize generated IDs and expiry as described below; arbitrary random/time
answers remain nondeterministic. Row ordering follows the task contract below. Cache storage
is never accessible to submitted processes.

Tests: `bun test src/services/execute/limits.test.ts src/services/reference-cache.test.ts
src/services/grading-cache.test.ts src/services/portal-login.test.ts`.
Redis integration requires `RUN_REDIS_INTEGRATION=1`, `REDIS_GRADING_URL`, and
`REDIS_GRADING_PASSWORD` pointing at disposable Compose grading services. Never run it against the live grading instance. Reference persistence integration requires `TEST_REFERENCE_DB`
pointing at a disposable MongoDB (writes its `portal` database).

## Grading contract and question-bank validation

Existing question banks and runtime datasets do not need edits. Imports remain nonempty JSON
arrays with `Question` (nonblank text), `Solution` (a nonempty array of nonblank commands),
and optional `Test`. `OrderMatters` is an optional override; existing references/questions
that specify sorting, ranking, or ordered list/stream ranges determine ordering automatically.

Existing `Test` queries execute as before and their structured outputs determine the grade.
When `Test` is absent, both reference and submission run with before/after database observations
collected by trusted code. A write is graded by its net state changes, including added, changed,
and deleted entities and unintended extra changes. A read must match the structured reference
output and leave state unchanged. For example, a legacy `Solution: ["SET name Alice"]` works
without a verifier; `SET unrelated Bob` fails automatically. The grading cache stores reference
observations and uses a new semantic version to invalidate older response-only entries.

Redis observations include key types, values, expiry, Search index definitions and functions;
hash/set order is normalized, list order is retained. Expiry times compare relative to execution
start with one second of tolerance. Untouched generated seed stream IDs are excluded from state
changes and normalized by stream/entry identity in stream query results. MongoDB observations
run in separate restricted processes using read credentials, capturing collection
data, options and index definitions. Document order is ignored and array/compound-index order
is retained. Generated ObjectIds are matched from seed/inserted document identity; ObjectId
literals in the reference remain significant. Arbitrary time/random-dependent results still
need deterministic execution; the checker cannot infer unrestricted application semantics.

Before adding imported questions, the API validates every entry and executes each reference
and any existing verifier against fresh data in an isolated execution scope. Invalid
banks are rejected as a whole. No `Test` is required for write references. Existing session
snapshots are checked for empty/invalid solutions before execution as well.

Results compare JSON structure and values, preserving duplicate rows and ignoring object
field order. Only row collections may reorder when ordering is not required; nested arrays
and positional tuples retain their order. Redis adapters preserve hash field/value pairs,
sorted-set member/score pairs, scan cursor/entry structure, and Search/Aggregate rows.
Unrecognized Redis reply shapes retain array order conservatively. The legacy trailing
`GEOSEARCH ... COUNT` form returns cardinality; native `COUNT n` limits keep Redis semantics.
MongoDB's final query expression is parsed as JavaScript, cursors are fully materialized,
and results use canonical Extended JSON to preserve BSON values.

Dataset `minPoints` is configurable in the category settings (or the upload API), must be
an integer from one through the selected question count, and is snapshotted for each attempt.
Legacy banks default to `min(10, selected question count)`. Completion and retry eligibility
share the same pass policy; completed attempts retain their threshold even if settings change.
Category changes/deletions that would make the threshold unreachable are rejected.

`/session` exposes only the current question plus its `sessionId` and `taskId`. `/query`
requires both IDs, and `/quit` requires `sessionId`. Queued and completed work cannot be
rebound to another question or attempt; saves, starts and completion use conditional atomic
updates. Unfinished responses contain only `{ result: null }`. Final responses contain
`result`, `passed`, `minPoints`, and `wrong`; early quit omits questions not yet displayed.
Active legacy sessions acquire IDs at API startup without losing saved answers.

Rebuild the Compose services together with the API. MongoDB execution uses protocol 3;
the grading cache uses a new semantic version automatically.

Regression tests: `bun test`. From the repository root, run MongoDB integration tests
inside a disposable executor:

```sh
podman-compose -f compose.dev.yaml exec -T -e RUN_GRADING_INTEGRATION=1 mongo-executor \
  python3 -c 'import sys; __file__="/opt/grading/test_executor.py"; exec(sys.stdin.read())' \
  < server/scripts/grading/test_executor.py
```

Use a test copy of the Compose project with separate portal/grading volumes. The executor
integration tests create unique scopes, verify concurrency, permissions, limits and cleanup,
and remove their own data. Redis integration uses the variables described above.

An exported existing bank can be checked without editing it using:
`RUN_LEGACY_BANK_INTEGRATION=1 LEGACY_BANKS_FILE=/path/to/export.json bun scripts/grading/check-legacy-banks.ts`.
Use only disposable grading engines. Optional `LEGACY_DATASET_ID` selects one bank; the
checker runs each reference twice across fresh resets and verifies that it is accepted.
