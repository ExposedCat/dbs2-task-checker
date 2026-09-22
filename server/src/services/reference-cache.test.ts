import { expect, test } from 'bun:test';
import type { Collection } from 'mongodb';
import {
  getOrComputeReference,
  referenceKey,
  type ReferenceCacheEntry,
  type ReferenceIdentity,
} from './reference-cache';

const identity: ReferenceIdentity = {
  datasetId: 'mongodb',
  datasetHash: 'dataset-a',
  solution: ['db.items.countDocuments()'],
  test: null,
  executorVersion: 'mongo-8-mongosh-2',
  scope: 'grading',
};

export function cacheFixture() {
  const entries = new Map<string, ReferenceCacheEntry>();
  const collection = {
    async findOne({ _id, expiresAt }: { _id: string; expiresAt: { $gt: Date } }) {
      const result = entries.get(_id);
      return result && result.expiresAt > expiresAt.$gt ? result : null;
    },
    async updateOne({ _id }: { _id: string }, { $set }: { $set: Omit<ReferenceCacheEntry, '_id'> }) {
      entries.set(_id, { _id, ...$set });
    },
  } as unknown as Collection<ReferenceCacheEntry>;
  return { entries, collection };
}

test('miss computes and saves; hit avoids computation and returns both reference outputs', async () => {
  const { collection, entries } = cacheFixture();
  let calls = 0;
  const compute = async () => {
    calls++;
    return { response: 'write-result', testResponse: 'verified-result' };
  };
  expect(await getOrComputeReference(collection, identity, compute)).toEqual(
    await getOrComputeReference(collection, identity, compute),
  );
  expect(calls).toBe(1);
  expect(entries.size).toBe(1);
});

test('each grading input and execution scope invalidates the key', () => {
  const key = referenceKey(identity);
  for (const change of [
    { datasetId: 'redis' },
    { datasetHash: 'dataset-b' },
    { solution: ['other solution'] },
    { test: 'verification query' },
    { executorVersion: 'next-engine' },
    { scope: 'different-database' },
  ])
    expect(referenceKey({ ...identity, ...change })).not.toBe(key);
});

test('failed reference executions are not cached and are retried', async () => {
  const { collection, entries } = cacheFixture();
  await expect(
    getOrComputeReference(collection, identity, async () => {
      throw new Error('reference failed');
    }),
  ).rejects.toThrow('reference failed');
  expect(entries.size).toBe(0);
  expect(
    await getOrComputeReference(collection, identity, async () => ({ response: 'ok', testResponse: null })),
  ).toEqual({ response: 'ok', testResponse: null });
});

test('expired cache entries are recomputed even before TTL cleanup', async () => {
  const { collection, entries } = cacheFixture();
  entries.set(referenceKey(identity), {
    _id: referenceKey(identity),
    response: 'old',
    testResponse: null,
    createdAt: new Date(0),
    expiresAt: new Date(0),
  });
  expect(
    (await getOrComputeReference(collection, identity, async () => ({ response: 'new', testResponse: null }))).response,
  ).toBe('new');
});
