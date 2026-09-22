import { expect, test } from 'bun:test';
import { MongoClient } from 'mongodb';
import { createDbConnection } from './database';
import { getOrComputeReference, type ReferenceCacheEntry } from './reference-cache';

const integration = process.env.TEST_REFERENCE_DB ? test : test.skip;
integration('MongoDB persists reference cache across clients and installs expiry index', async () => {
  const url = process.env.TEST_REFERENCE_DB!;
  const database = await createDbConnection(url);
  const identity = {
    datasetId: 'mongodb',
    datasetHash: 'sample',
    solution: ['reference'],
    test: null,
    executorVersion: 'test',
    scope: 'test',
  };
  let executions = 0;
  const compute = async () => {
    executions++;
    return { response: 'expected', testResponse: null };
  };
  const first = await getOrComputeReference(database.referenceCache, identity, compute);
  const other = new MongoClient(url);
  await other.connect();
  try {
    const collection = other.db('portal').collection<ReferenceCacheEntry>('referenceCache');
    expect(await getOrComputeReference(collection, identity, compute)).toEqual(first);
    expect(executions).toBe(1);
    const indexes = await collection.indexes();
    expect(indexes.some(index => index.key.expiresAt === 1 && index.expireAfterSeconds === 0)).toBe(true);
  } finally {
    await other.close();
  }
});
