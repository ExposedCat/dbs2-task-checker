import { beforeEach, expect, mock, test } from 'bun:test';
import { ObjectId, type WithId } from 'mongodb';
import type { Database } from './database';
import type { User, TestSession } from './user';
import type { Dataset } from './dataset';
import type { ReferenceCacheEntry } from './reference-cache';

const calls: { queries: string[]; noReset: boolean; readOnly: boolean }[] = [];
let failReference = false;
let gate: (() => Promise<void>) | null = null;
let state: Record<string, string> = {};
mock.module('./execute/index', () => ({
  execute: async ({
    queries,
    noReset = false,
    readOnly = false,
    captureState = false,
  }: (typeof calls)[number] & { captureState?: boolean }) => {
    calls.push({ queries, noReset, readOnly });
    if (failReference && queries[0] === 'reference') return { ok: false, data: null, error: 'failed' };
    if (gate && queries[0] === 'student') await gate();
    if (!noReset) state = {};
    const before = structuredClone(state);
    let response = '"result"';
    for (const query of queries) {
      if (query.startsWith('SET ')) {
        if (readOnly) return { ok: false, data: null, error: 'Test required' };
        const [, key, value] = query.split(' ');
        state[key] = value;
        response = '"OK"';
      } else if (query.startsWith('GET ')) response = JSON.stringify(state[query.slice(4)] ?? null);
      else if (query === 'verify') response = '"verified"';
      else if (query === 'invalid-json') response = 'not JSON';
    }
    return {
      ok: true,
      error: null,
      data: {
        response,
        ...(captureState ? { state: { engine: 'redis', before, after: structuredClone(state), startedAt: 0 } } : {}),
      },
    };
  },
}));
mock.module('./execute/dataset-identity', () => ({ executionDatasetHash: async () => 'dataset-hash' }));
const { executeQuestion, quitTestSession, startTestSession } = await import('./user');
const { createOrUpdateDataset, setDatasetKinds } = await import('./dataset');
const { hasPassed } = await import('./test-policy');
beforeEach(() => {
  calls.length = 0;
  failReference = false;
  gate = null;
});

function fixture(testQuery: string | null = null) {
  const task = (id: string): TestSession['tasks'][number] => ({
    id,
    kind: 'test',
    question: `question-${id}`,
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
    testSession: { id: 'session-1', minPoints: 2, datasetId: 'mongodb', tasks: [task('one'), task('two')] },
  };
  const dataset: Dataset = { id: 'mongodb', name: 'MongoDB', kinds: { test: 2 }, bank: [task('one'), task('two')] };
  const cache = new Map<string, ReferenceCacheEntry>();
  const copyUser = (): WithId<User> => ({ ...structuredClone(user), _id: user._id });
  const get = (path: string): unknown => path.split('.').reduce<any>((item, key) => item?.[key], user);
  const matches = (filter: Record<string, unknown>) =>
    Object.entries(filter).every(([key, value]) =>
      key === '_id' ? String(value) === String(user._id) : JSON.stringify(get(key)) === JSON.stringify(value),
    );
  const update = (changes: {
    $set?: Record<string, unknown>;
    $push?: { submissions: User['submissions'][number] };
  }) => {
    for (const [path, value] of Object.entries(changes.$set ?? {})) {
      const keys = path.split('.');
      const last = keys.pop()!;
      const target = keys.reduce<any>((item, key) => item[key], user);
      target[last] = structuredClone(value);
    }
    if (changes.$push) user.submissions.push(structuredClone(changes.$push.submissions));
  };
  let published = 0;
  const database = {
    referenceCache: {
      findOne: async ({ _id }: { _id: string }) => cache.get(_id) ?? null,
      updateOne: async ({ _id }: { _id: string }, { $set }: { $set: ReferenceCacheEntry }) => {
        cache.set(_id, $set);
      },
    },
    datasets: {
      findOne: async () => structuredClone(dataset),
      aggregate: () => ({ toArray: async () => [{ kind: 'test', bank: structuredClone(dataset.bank) }] }),
      findOneAndUpdate: async () => {
        published++;
      },
      updateOne: async (_: unknown, changes: { $set: Partial<Dataset> }) => {
        published++;
        Object.assign(dataset, changes.$set);
      },
    },
    users: {
      findOneAndUpdate: async (filter: Record<string, unknown>, changes: Parameters<typeof update>[0]) => {
        if (!matches(filter)) return null;
        update(changes);
        return copyUser();
      },
      updateOne: async (filter: Record<string, unknown>, changes: Parameters<typeof update>[0]) => {
        if (!matches(filter)) return { modifiedCount: 0 };
        update(changes);
        return { modifiedCount: 1 };
      },
    },
  } as unknown as Database;
  const args = (queries: string[] = ['student']) => ({
    database,
    user: copyUser(),
    queries,
    sessionId: user.testSession!.id,
    taskId: user.testSession!.tasks.find(task => task.userSolution === null)!.id,
  });
  return { user, database, dataset, cache, args, copyUser, published: () => published };
}

test('cold reference runs first; warm submissions only execute student plus existing verification', async () => {
  const f = fixture('verify');
  expect(await executeQuestion(f.args())).toEqual({ ok: true, error: null, data: { result: null } });
  expect(calls).toEqual([
    { queries: ['reference'], noReset: false, readOnly: false },
    { queries: ['verify'], noReset: true, readOnly: false },
    { queries: ['student'], noReset: false, readOnly: false },
    { queries: ['verify'], noReset: true, readOnly: false },
  ]);
  expect(f.user.testSession!.tasks[0].correct).toBe(true);
  calls.length = 0;
  expect((await executeQuestion(f.args())).ok).toBe(true);
  expect(calls).toEqual([
    { queries: ['student'], noReset: false, readOnly: false },
    { queries: ['verify'], noReset: true, readOnly: false },
  ]);
  expect(f.cache.size).toBe(1);
  expect(f.user.submissions[0].grade).toBe(2);
});

test('failed references never run student code or populate cache', async () => {
  failReference = true;
  const f = fixture();
  await expect(executeQuestion(f.args())).rejects.toThrow('reference solution');
  expect(f.cache.size).toBe(0);
  expect(calls.map(call => call.queries)).toEqual([['reference']]);
});

test('skipping does not calculate a reference or expose correctness or unseen questions', async () => {
  const f = fixture();
  expect(await executeQuestion(f.args(['  ']))).toEqual({ ok: true, error: null, data: { result: null } });
  expect(calls).toEqual([]);
  expect(f.cache.size).toBe(0);
  expect(f.user.testSession!.tasks[0].correct).toBe(false);
});

test('identical OK write replies are graded by final state', async () => {
  const f = fixture('GET name');
  f.user.testSession!.tasks.forEach(task => {
    task.solution = ['SET name Alice'];
  });
  expect((await executeQuestion(f.args(['SET unrelated Bob']))).ok).toBe(true);
  expect(f.user.testSession!.tasks[0].correct).toBe(false);
  expect(await executeQuestion(f.args(['SET name Alice']))).toEqual({
    ok: true,
    error: null,
    data: {
      result: 1,
      wrong: ['question-one'],
      passed: false,
      minPoints: 2,
    },
  });
});

test('legacy writes without Test grade automatically and reject unrelated changes', async () => {
  const f = fixture();
  f.user.testSession!.tasks.forEach(task => {
    task.solution = ['SET name Alice'];
  });
  expect((await executeQuestion(f.args(['SET unrelated Bob']))).ok).toBe(true);
  expect(f.user.testSession!.tasks[0].correct).toBe(false);
  expect(await executeQuestion(f.args(['SET name Bob', 'SET name Alice']))).toMatchObject({
    ok: true,
    data: { result: 1 },
  });
});

test('automatic state grading rejects extra side effects even when command replies match', async () => {
  const f = fixture();
  f.user.testSession!.tasks.forEach(task => {
    task.solution = ['SET name Alice'];
  });
  expect((await executeQuestion(f.args(['SET name Alice', 'SET unrelated Bob']))).ok).toBe(true);
  expect(f.user.testSession!.tasks[0].correct).toBe(false);
});

test('a delayed result cannot save into a restarted session', async () => {
  const f = fixture();
  let release!: () => void;
  let started!: () => void;
  const running = new Promise<void>(resolve => {
    started = resolve;
  });
  const waiting = new Promise<void>(resolve => {
    release = resolve;
  });
  gate = async () => {
    started();
    await waiting;
  };
  const pending = executeQuestion(f.args());
  await running;
  expect(
    (await quitTestSession({ database: f.database, user: f.copyUser(), force: true, sessionId: 'session-1' })).ok,
  ).toBe(true);
  expect(
    (
      await startTestSession({
        database: f.database,
        user: f.copyUser(),
        datasetId: 'mongodb',
        cathegories: { test: 2 },
        minPoints: 2,
      })
    ).ok,
  ).toBe(true);
  const newSession = structuredClone(f.user.testSession);
  release();
  expect((await pending).ok).toBe(false);
  expect(f.user.testSession).toEqual(newSession);
  expect(f.user.submissions).toHaveLength(1);
});

test('stale queued task IDs and duplicate submissions are rejected', async () => {
  const f = fixture();
  const old = f.args();
  expect((await executeQuestion(old)).ok).toBe(true);
  const count = calls.length;
  expect((await executeQuestion({ ...old, user: f.copyUser() })).ok).toBe(false);
  expect(calls).toHaveLength(count);
  expect((await executeQuestion(old)).ok).toBe(false);
  const current = f.args();
  f.user.testSession!.id = 'replacement';
  expect((await executeQuestion({ ...current, user: f.copyUser() })).ok).toBe(false);
});

test('early quit hides unseen questions; stale/repeated quit cannot clear a new session', async () => {
  const f = fixture();
  const args = { database: f.database, user: f.copyUser(), sessionId: 'session-1', force: true };
  expect(await quitTestSession(args)).toEqual({
    ok: true,
    error: null,
    data: { result: 0, wrong: ['question-one'], passed: false, minPoints: 2 },
  });
  expect((await quitTestSession(args)).ok).toBe(false);
  expect(f.user.submissions).toHaveLength(1);
  expect(
    (
      await startTestSession({
        database: f.database,
        user: f.copyUser(),
        datasetId: 'mongodb',
        cathegories: { test: 2 },
        minPoints: 1,
      })
    ).ok,
  ).toBe(true);
  expect((await quitTestSession(args)).ok).toBe(false);
  expect(f.user.testSession).not.toBeNull();
});

test('short tests pass at their threshold and the same policy denies retries', async () => {
  const f = fixture();
  f.user.testSession!.minPoints = 1;
  await executeQuestion(f.args());
  const result = await executeQuestion(f.args([]));
  expect(result.ok && result.data).toMatchObject({ result: 1, passed: true, minPoints: 1 });
  expect(hasPassed(f.user.submissions, 'mongodb', 2)).toBe(true);
  expect(
    (
      await startTestSession({
        database: f.database,
        user: f.copyUser(),
        datasetId: 'mongodb',
        cathegories: { test: 2 },
        minPoints: 2,
      })
    ).ok,
  ).toBe(false);
});

test('imports reject malformed entries but accept executable legacy writes without Test', async () => {
  const f = fixture();
  const entry = { Question: 'Name?', Solution: ['reference'], Test: null };
  for (const data of [
    null,
    {},
    [],
    [null],
    [{}],
    [{ ...entry, Question: '' }],
    [{ ...entry, Solution: [] }],
    [{ ...entry, Solution: [' '] }],
    [{ ...entry, Solution: [1] }],
    [{ ...entry, OrderMatters: 'yes' }],
    [{ ...entry, Solution: ['invalid-json'] }],
  ]) {
    expect(
      (await createOrUpdateDataset({ database: f.database, id: 'mongodb', name: 'Mongo', kind: 'test', data })).ok,
    ).toBe(false);
  }
  expect(f.published()).toBe(0);
  expect(
    (
      await createOrUpdateDataset({
        database: f.database,
        id: 'mongodb',
        name: 'Mongo',
        kind: 'test',
        data: [{ Question: 'Set the name', Solution: ['SET name Alice'] }],
      })
    ).ok,
  ).toBe(true);
  expect(f.published()).toBe(1);
});

test('unreachable thresholds and category counts are rejected at configuration and start', async () => {
  const f = fixture();
  for (const [kinds, minPoints] of [
    [{ test: 1 }, 2],
    [{ test: 3 }, 1],
    [{ test: -1 }, 1],
    [{ test: 1 }, 1.5],
  ] as const) {
    expect((await setDatasetKinds({ database: f.database, datasetId: 'mongodb', kinds, minPoints })).ok).toBe(false);
  }
  expect(f.published()).toBe(0);
  f.user.testSession = null;
  expect(
    (
      await startTestSession({
        database: f.database,
        user: f.copyUser(),
        datasetId: 'mongodb',
        cathegories: { test: 2 },
        minPoints: 10,
      })
    ).ok,
  ).toBe(false);
  expect(f.user.testSession).toBeNull();
});
