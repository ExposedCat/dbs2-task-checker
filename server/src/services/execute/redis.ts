import { ErrorReply, createClient } from 'redis';
import { parseCommand } from '../escape.js';
import type { BaseExecuteArgs, ExecuteResult } from './index.js';
import { EXECUTION_TIMEOUT_MS, MAX_OUTPUT_BYTES } from './limits';
import { gradingBroker } from './broker';

const REDIS_GRADING_SOCKET = process.env.REDIS_GRADING_SOCKET;
export type ExecuteRedisArgs = BaseExecuteArgs & { dataset: string[][] };

export async function executeRedis({ queries, dataset, noReset = false }: ExecuteRedisArgs): Promise<ExecuteResult> {
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
    let response = '';
    let bytes = 0;
    for (const [index, query] of normalizedQueries.entries()) {
      if (expired) throw new Error('Execution time limit exceeded');
      commandIndex = index;
      const result = await client.sendCommand(parseCommand(query));
      const text = result !== undefined ? JSON.stringify(result, null, 1) : '<empty>';
      bytes += Buffer.byteLength(text) + 1;
      if (bytes > MAX_OUTPUT_BYTES) throw new Error('Execution output limit exceeded');
      response += `${text}\n`;
    }
    return { ok: true, error: null, data: { response } };
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
