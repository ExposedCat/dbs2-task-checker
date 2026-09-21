/**
 * Provisions a portal user together with their sandbox MongoDB user.
 *
 * Usage (inside the server container):
 *   bun run scripts/create-user.ts --user alice --password s3cret --port 6380 [--admin]
 *
 * - Upserts the user into the portal database (DB_CONNECTION_URL).
 * - Creates/updates a MongoDB user `<user>` owning database `<user>` on the sandbox
 *   MongoDB (MONGO_SANDBOX_ROOT_URL). Skipped with a warning if the URL is not set.
 * - `--port` is the port of the student's sandbox Redis instance; the same password is
 *   used for it. Remember to add `<port>:<password>` to redis-sandbox/instances.conf.
 */
import { parseArgs } from 'node:util';

import { MongoClient } from 'mongodb';

import { createDbConnection } from '../src/services/database';

const { values } = parseArgs({
  options: {
    user: { type: 'string' },
    password: { type: 'string' },
    port: { type: 'string' },
    admin: { type: 'boolean', default: false },
  },
});

const { user, password, admin } = values;
const port = Number(values.port);

if (!user || !password || !Number.isInteger(port) || port <= 0) {
  console.error(
    'Usage: bun run scripts/create-user.ts --user <login> --password <password> --port <redis port> [--admin]',
  );
  process.exit(1);
}

const database = await createDbConnection(process.env.DB_CONNECTION_URL ?? 'mongodb://127.0.0.1:27017');
await database.users.updateOne(
  { user },
  {
    // `--admin` promotes; omitting it never demotes an existing admin
    $set: { password, port, ...(admin && { admin: true }) },
    $setOnInsert: { user, testSession: null, submissions: [], ...(!admin && { admin: false }) },
  },
  { upsert: true },
);
console.log(`Portal user '${user}' saved (admin: ${admin}, redis port: ${port})`);

const sandboxUrl = process.env.MONGO_SANDBOX_ROOT_URL;
if (!sandboxUrl) {
  console.warn('MONGO_SANDBOX_ROOT_URL is not set: skipping sandbox MongoDB user provisioning');
} else {
  const sandbox = new MongoClient(sandboxUrl);
  await sandbox.connect();
  const userDb = sandbox.db(user);
  const { users } = await userDb.command({ usersInfo: user });
  if (users.length > 0) {
    await userDb.command({ updateUser: user, pwd: password });
    console.log(`Sandbox MongoDB user '${user}' password updated`);
  } else {
    await userDb.command({ createUser: user, pwd: password, roles: [{ role: 'dbOwner', db: user }] });
    console.log(`Sandbox MongoDB user '${user}' created (owner of database '${user}')`);
  }
  await sandbox.close();
}

console.log(`\nNext: make sure redis-sandbox/instances.conf contains a line "${port}:${password}"`);
process.exit(0);
