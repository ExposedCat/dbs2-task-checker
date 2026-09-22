import { expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { Database } from './database';
import type { WithId } from 'mongodb';
import type { User, TestSession } from './user';
import type { ReferenceCacheEntry } from './reference-cache';

const calls: { queries: string[]; noReset: boolean }[] = [];
let failReference = false;
mock.module('./execute/index', () => ({
  execute: async ({ queries, noReset = false }: { queries: string[]; noReset?: boolean }) => {
    calls.push({ queries, noReset });
    if (failReference && queries[0] === 'reference') return { ok: false, data: null, error: 'failed' };
    return { ok: true, error: null, data: { response: queries[0] === 'verify' ? 'verified' : 'result' } };
  },
}));
mock.module('./execute/dataset-identity', () => ({ executionDatasetHash: async () => 'dataset-hash' }));
const { executeQuestion } = await import('./user');

function fixture(testQuery: string | null = null) {
  const task = (): TestSession['tasks'][number] => ({
    kind: 'test',
    question: 'question',
    solution: ['reference'],
    test: testQuery,
    response: null,
    testResponse: null,
    userSolution: null,
    userResponse: null,
    userTestResponse: null,
    correct: false,
  });
  const user: WithId<User> = {
    _id: new ObjectId(),
    user: 'student',
    port: 6380,
    admin: false,
    submissions: [],
    testSession: { datasetId: 'mongodb', tasks: [task(), task()] },
  };
  const cache = new Map<string, ReferenceCacheEntry>();
  let correct: boolean | undefined;
  const database = {
    referenceCache: {
      findOne: async ({ _id }: { _id: string }) => cache.get(_id) ?? null,
      updateOne: async ({ _id }: { _id: string }, { $set }: { $set: ReferenceCacheEntry }) => {
        cache.set(_id, $set);
      },
    },
    users: {
      findOneAndUpdate: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
        correct = update.$set['testSession.tasks.0.correct'] as boolean;
        return user;
      },
    },
  } as unknown as Database;
  return { user, database, cache, isCorrect: () => correct };
}

test('cold reference runs first; warm submissions execute no reference; verification uses noReset', async () => {
  calls.length = 0;
  const f = fixture('verify');
  expect((await executeQuestion({ ...f, queries: ['student'] })).ok).toBe(true);
  expect(calls).toEqual([
    { queries: ['reference'], noReset: false },
    { queries: ['verify'], noReset: true },
    { queries: ['student'], noReset: false },
    { queries: ['verify'], noReset: true },
  ]);
  expect(f.isCorrect()).toBe(true);
  calls.length = 0;
  expect((await executeQuestion({ ...f, queries: ['student'] })).ok).toBe(true);
  expect(calls).toEqual([
    { queries: ['student'], noReset: false },
    { queries: ['verify'], noReset: true },
  ]);
  expect(f.cache.size).toBe(1);
});

test('failed reference never runs student code or populates cache', async () => {
  calls.length = 0;
  failReference = true;
  const f = fixture();
  try {
    await expect(executeQuestion({ ...f, queries: ['student'] })).rejects.toThrow('reference solution');
    expect(f.cache.size).toBe(0);
    expect(calls.map(call => call.queries)).toEqual([['reference']]);
  } finally {
    failReference = false;
  }
});

test('skipping an answer does not calculate a reference', async () => {
  calls.length = 0;
  const f = fixture();
  expect((await executeQuestion({ ...f, queries: ['  '] })).ok).toBe(true);
  expect(calls).toEqual([]);
  expect(f.cache.size).toBe(0);
  expect(f.isCorrect()).toBe(false);
});
