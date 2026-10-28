import { randomUUID } from 'node:crypto';
import { requiredPoints } from './test-policy';
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

  // Upgrade active pre-ID sessions without losing their saved answers.
  for await (const user of users.find({ testSession: { $ne: null }, 'testSession.id': { $exists: false } })) {
    if (!user.testSession) continue;
    const dataset = await datasets.findOne({ id: user.testSession.datasetId });
    const total = user.testSession.tasks.length;
    await users.updateOne(
      { _id: user._id, 'testSession.id': { $exists: false } },
      {
        $set: {
          testSession: {
            ...user.testSession,
            id: randomUUID(),
            minPoints: Math.min(total, dataset ? requiredPoints(dataset) : 10),
            tasks: user.testSession.tasks.map(task => ({ ...task, id: randomUUID() })),
          },
        },
      },
    );
  }

  const referenceCache = mongoDb.collection<ReferenceCacheEntry>('referenceCache');
  await referenceCache.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  const database: Database = { users, datasets, referenceCache };
  return database;
}
