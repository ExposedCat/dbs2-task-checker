import { expect, test } from 'bun:test';
import { createClient } from 'redis';
import { executeRedis } from './redis';
import { MAX_OUTPUT_BYTES } from './limits';

// Use a disposable instance with a private Unix socket and the production non-admin ACL.
const integration = process.env.RUN_REDIS_INTEGRATION === '1' && process.env.REDIS_GRADING_SOCKET ? test : test.skip;
integration('loads dataset without credentials and denies administration', async () => {
  expect(await executeRedis({ dataset: [['SET', 'sample', 'value']], queries: ['GET sample'] })).toMatchObject({
    ok: true,
    error: null,
    data: { response: '"value"\n' },
  });
  const rejected = await executeRedis({ dataset: [], noReset: true, queries: ['CONFIG GET maxmemory'] });
  expect(rejected.ok).toBe(false);
  if (!rejected.ok) expect(rejected.error).toContain('NOPERM');
});
integration('rejects oversized output', async () => {
  const client = createClient({ socket: { path: process.env.REDIS_GRADING_SOCKET! } });
  await client.connect();
  try {
    await client.set('large', 'x'.repeat(MAX_OUTPUT_BYTES + 1));
  } finally {
    await client.disconnect();
  }
  const result = await executeRedis({ dataset: [], noReset: true, queries: ['GET large'] });
  expect(result.ok).toBe(false);
});

integration('read-only tasks reject writes and preserve hash field/value associations', async () => {
  const rejected = await executeRedis({ dataset: [], queries: ['SET unrelated Bob'], readOnly: true });
  expect(rejected.ok).toBe(false);
  const result = await executeRedis({
    dataset: [['HSET', 'person', 'name', 'Alice', 'age', '20']],
    queries: ['HGETALL person'],
    readOnly: true,
  });
  expect(result.ok).toBe(true);
  if (result.ok)
    expect(JSON.parse(result.data.comparisonResponse!)).toEqual([
      { value: { name: 'Alice', age: '20' }, rowPaths: [] },
    ]);
});

integration('legacy write tasks without Test compare final state and reject unrelated/extra changes', async () => {
  const { sameStateChanges } = await import('../state-comparison');
  const run = async (queries: string[]) => {
    const result = await executeRedis({ dataset: [], queries, captureState: true });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    return result.data.state!;
  };
  const expected = await run(['SET name Alice']);
  expect(sameStateChanges(expected, await run(['SET unrelated Bob']))).toBe(false);
  expect(sameStateChanges(expected, await run(['SET name Bob', 'SET name Alice']))).toBe(true);
  expect(sameStateChanges(expected, await run(['SET name Alice', 'SET unrelated Bob']))).toBe(false);
});

integration(
  'automatic state comparison preserves list order and normalizes hash/set ordering and expiration clocks',
  async () => {
    const { sameStateChanges } = await import('../state-comparison');
    const run = async (queries: string[]) => {
      const result = await executeRedis({ dataset: [], queries, captureState: true });
      if (!result.ok) throw new Error(result.error);
      return result.data.state!;
    };
    const expected = await run([
      'HSET person name Alice age 20',
      'SADD members Alice Bob',
      'RPUSH list Alice Bob',
      'EXPIRE person 300',
    ]);
    expect(
      sameStateChanges(
        expected,
        await run([
          'HSET person age 20 name Alice',
          'SADD members Bob Alice',
          'RPUSH list Alice Bob',
          'EXPIRE person 300',
        ]),
      ),
    ).toBe(true);
    expect(
      sameStateChanges(
        expected,
        await run([
          'HSET person age 20 name Alice',
          'SADD members Bob Alice',
          'RPUSH list Bob Alice',
          'EXPIRE person 300',
        ]),
      ),
    ).toBe(false);
  },
);

integration('seed-generated stream IDs do not reject equivalent read results across resets', async () => {
  const { compareResponses } = await import('../comparison');
  const dataset = [
    ['XADD', 'orders', '*', 'name', 'Alice'],
    ['XADD', 'orders', '*', 'name', 'Bob'],
  ];
  const run = async () => {
    const result = await executeRedis({ dataset, queries: ['XREVRANGE orders + - COUNT 2'], captureState: true });
    if (!result.ok) throw new Error(result.error);
    return result.data;
  };
  const a = await run();
  const b = await run();
  expect(compareResponses(a.response, b.response, true, a.comparisonResponse, b.comparisonResponse)).toBe(true);
});
