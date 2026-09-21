import { MongoClient } from 'mongodb';
import type { Collection } from 'mongodb';

import type { Dataset } from './dataset';
import type { User } from './user';

export type Database = {
  users: Collection<User>;
  datasets: Collection<Dataset>;
};

export async function createDbConnection(connectionString: string) {
  const client = new MongoClient(connectionString);
  await client.connect();

  const mongoDb = client.db('portal');
  const users = mongoDb.collection<User>('users');
  const datasets = mongoDb.collection<Dataset>('datasets');

  const database: Database = { users, datasets };
  return database;
}
