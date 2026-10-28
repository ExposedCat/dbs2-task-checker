import { prepareRedisCommand } from './redis-command';
import { redisSnapshot, normalizeStreamReply } from './redis-state';
import { redisComparisonReply } from './redis-results';
import type { ComparisonReply } from '../comparison';
import { ErrorReply, createClient } from 'redis';
import { parseCommand } from '../escape.js';
import type { BaseExecuteArgs, ExecuteResult } from './index.js';
import { EXECUTION_TIMEOUT_MS, MAX_OUTPUT_BYTES } from './limits';
import { gradingBroker } from './broker';

const REDIS_GRADING_SOCKET = process.env.REDIS_GRADING_SOCKET;
export type ExecuteRedisArgs = BaseExecuteArgs & { dataset: string[][] };

export async function executeRedis({
  queries,
  dataset,
  noReset = false,
  readOnly = false,
  captureState = false,
}: ExecuteRedisArgs): Promise<ExecuteResult> {
  if (!REDIS_GRADING_SOCKET) return { ok: false, data: null, error: 'Private Redis grading socket is not configured' };
  const client = createClient({
    socket: {
      path: REDIS_GRADING_SOCKET,
      connectTimeout: 5000,
      reconnectStrategy: false,
    },
    disableOfflineQueue: true,
  });
  // node-redis emits transport errors as well as rejecting command promises.
  client.on('error', () => {});
  let expired = false;
  let commandIndex = -1;
  const normalizedQueries = queries.map(query => query.trim()).filter(Boolean);
  const close = async () => {
    if (client.isOpen) await client.disconnect().catch(() => {});
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      reject(new Error('Execution time limit exceeded'));
      void close(); // QUIT would wait behind a blocking command.
    }, EXECUTION_TIMEOUT_MS);
  });
  const run = async (): Promise<ExecuteResult> => {
    await client.connect();
    if (!noReset) {
      for (const index of await client.ft._list()) {
        if (expired) throw new Error('Execution time limit exceeded');
        await client.ft.dropIndex(index);
      }
      await client.flushAll();
      await client.sendCommand(['SCRIPT', 'FLUSH']);
      await client.sendCommand(['FUNCTION', 'FLUSH']);
      for (const command of dataset) {
        if (expired) throw new Error('Execution time limit exceeded');
        if (command.length) await client.sendCommand(command);
      }
    }
    if (!normalizedQueries.length) {
      return {
        ok: true,
        error: null,
        data: {
          response: noReset ? 'Dataset not loaded (noReset = true)' : 'Dataset loaded',
          skipped: true,
        },
      };
    }
    const before = captureState
      ? await redisSnapshot((args, buffered) => client.sendCommand(args, { returnBuffers: buffered }))
      : undefined;
    const startedAt = Date.now();
    let response = '';
    const replies: ComparisonReply[] = [];
    let bytes = 0;
    for (const [index, query] of normalizedQueries.entries()) {
      if (expired) throw new Error('Execution time limit exceeded');
      commandIndex = index;
      const original = parseCommand(query);
      const { command, count } = prepareRedisCommand(original, readOnly);
      if (readOnly) {
        // Let Redis classify module commands too. Unknown, transaction, connection,
        // and scripting commands without the readonly flag are rejected conservatively.
        const info = (await client.sendCommand(['COMMAND', 'INFO', command[0]])) as (unknown[] | null)[];
        const flags = info[0]?.[2];
        if (!Array.isArray(flags) || !flags.includes('readonly')) {
          return {
            ok: false,
            data: null,
            error: 'Verification query must be read-only',
          };
        }
      }
      const rawResult = await client.sendCommand(command);
      const result = count && Array.isArray(rawResult) ? rawResult.length : rawResult;
      replies.push(redisComparisonReply(original, before ? normalizeStreamReply(original, result, before) : result));
      const text = result !== undefined ? JSON.stringify(result, null, 1) : '<empty>';
      bytes += Buffer.byteLength(text) + 1;
      if (bytes > MAX_OUTPUT_BYTES) throw new Error('Execution output limit exceeded');
      response += `${text}\n`;
    }
    const state = before
      ? {
          engine: 'redis' as const,
          before,
          startedAt,
          after: await redisSnapshot((args, buffered) => client.sendCommand(args, { returnBuffers: buffered })),
        }
      : undefined;
    return {
      ok: true,
      error: null,
      data: { response, comparisonResponse: JSON.stringify(replies), ...(state ? { state } : {}) },
    };
  };
  try {
    return await Promise.race([run(), deadline]);
  } catch (error) {
    if (expired || !(error instanceof ErrorReply)) {
      await close();
      const recovery = await gradingBroker('/redis-restart', {});
      if (!recovery.ok) return { ok: false, data: null, error: 'Redis recovery failed; grading is unavailable' };
    }
    const position =
      commandIndex >= 0 && normalizedQueries.length > 1
        ? ` (command ${commandIndex + 1} of ${normalizedQueries.length})`
        : '';
    return {
      ok: false,
      data: null,
      error: expired
        ? 'Execution time limit exceeded'
        : error instanceof ErrorReply
          ? `Redis error${position}: ${error.message}`
          : error instanceof Error
            ? error.message
            : 'Query execution failed',
    };
  } finally {
    clearTimeout(timer);
    await close();
  }
}
