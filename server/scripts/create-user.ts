/** Portal identity provisioning. Database accounts are managed separately by host scripts. */
import { parseArgs } from 'node:util';
import { createDbConnection } from '../src/services/database';

const { values } = parseArgs({
  options: {
    user: { type: 'string' },
    port: { type: 'string' },
    admin: { type: 'boolean', default: false },
  },
});
const { user, admin } = values;
const port = values.port === undefined ? 0 : Number(values.port);
if (!user || !/^[a-z_][a-z0-9_-]{0,63}$/.test(user) || !Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('Usage: bun run scripts/create-user.ts --user <login> [--port <personal Redis port>] [--admin]');
  process.exit(1);
}
const database = await createDbConnection(process.env.DB_CONNECTION_URL ?? 'mongodb://127.0.0.1:27017');
await database.users.updateOne(
  { user },
  {
    $set: { ...(values.port !== undefined && { port }), ...(admin && { admin: true }) },
    $unset: { password: '' },
    $setOnInsert: {
      user,
      testSession: null,
      submissions: [],
      ...(!admin && { admin: false }),
      ...(values.port === undefined && { port: 0 }),
    },
  },
  { upsert: true },
);
console.log(`Portal identity '${user}' saved; no password stored`);
process.exit(0);
