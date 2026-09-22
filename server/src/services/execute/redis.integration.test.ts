import { expect, test } from 'bun:test';
import { createClient } from 'redis';
import { executeRedis } from './redis';
import { MAX_OUTPUT_BYTES } from './limits';

// Use a disposable instance with a private Unix socket and the production non-admin ACL.
const integration = process.env.RUN_REDIS_INTEGRATION === '1' && process.env.REDIS_GRADING_SOCKET ? test : test.skip;
integration('loads dataset without credentials and denies administration', async () => {
  expect(await executeRedis({ dataset: [['SET', 'sample', 'value']], queries: ['GET sample'] })).toEqual({
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
