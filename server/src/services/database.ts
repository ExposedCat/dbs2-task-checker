import { MongoClient } from 'mongodb';
import type { Collection } from 'mongodb';

import type { Dataset } from './dataset';
import type { User } from './user';
import type { ReferenceCacheEntry } from './reference-cache';

export type Database = {
  users: Collection<User>;
  datasets: Collection<Dataset>;
  referenceCache: Collection<ReferenceCacheEntry>;
};

export async function createDbConnection(connectionString: string) {
  const client = new MongoClient(connectionString);
  await client.connect();

  const mongoDb = client.db('portal');
  const users = mongoDb.collection<User>('users');
  await users.updateMany({ created: { $exists: false } }, { $set: { created: true } });
  const datasets = mongoDb.collection<Dataset>('datasets');

  const referenceCache = mongoDb.collection<ReferenceCacheEntry>('referenceCache');
  await referenceCache.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  const database: Database = { users, datasets, referenceCache };
  return database;
}
