import { createDbConnection } from '../services/database';

const database = await createDbConnection(process.env.DB_CONNECTION_URL ?? 'mongodb://127.0.0.1:27017');

await database.users.updateMany(
  {},
  {
    $set: { submissions: [] },
  },
);
