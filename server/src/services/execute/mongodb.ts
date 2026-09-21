import { $, type ShellError } from 'bun';
import type { User } from '../user.js';
import type { BaseExecuteArgs, ExecuteResult } from './index.js';

export type LoadMongodbArgs = Omit<BaseExecuteArgs, 'queries' | 'dataset'>;

export type LoadMongodbResponse = {
  response: string;
  ok: boolean;
};

async function executeAuthorizedRaw(user: User, command: string): Promise<{ ok: boolean; output: string }> {
  try {
    const result =
      await $`mongosh -u ${encodeURIComponent(user.user)} -p '${encodeURIComponent(user.password)}' --port 42222 ${encodeURIComponent(user.user)} --eval "${command}"`;
    return { ok: result.exitCode === 0, output: result.text() };
  } catch (_error) {
    const error = _error as ShellError;
    const textError = 'info' in error ? (error.info as any).stderr : 'Unkown error';
    return { ok: false, output: textError };
  }
}

async function loadMongoDb({ user, noReset }: LoadMongodbArgs): Promise<LoadMongodbResponse> {
  if (!noReset) {
    try {
      await $`mongosh -u ${encodeURIComponent(user.user)} -p '${encodeURIComponent(user.password)}' --port 42222 ${encodeURIComponent(user.user)} --eval 'db.getCollectionNames().forEach(collection => db[collection].drop())'`;

      await $`mongosh -u ${encodeURIComponent(user.user)} -p '${encodeURIComponent(user.password)}' --port 42222 ${encodeURIComponent(user.user)} /home/yuliia/web/dbs2-task-checker-server/datasets/mongodb/dataset.js`;

      return { ok: true, response: 'Dataset loaded' };
    } catch (_error) {
      const error = _error as ShellError;
      const textError = 'info' in error ? (error.info as any).stderr : 'Unkown error';
      return { ok: false, response: textError };
    }
  }

  return { ok: true, response: 'Dataset not loaded (noReset = true)' };
}

export async function executeMongoDb({ user, queries, noReset = false }: BaseExecuteArgs): Promise<ExecuteResult> {
  const { ok, response: loadingResponse } = await loadMongoDb({ user, noReset });

  if (!ok) {
    return { ok, error: loadingResponse, data: null };
  }

  const normalizedQueries = queries.map(query => query.trim()).filter(query => query.length > 0);

  if (normalizedQueries.length === 0) {
    return {
      ok: true,
      data: { response: loadingResponse ?? '', skipped: true },
      error: null,
    };
  }

  const response = await executeAuthorizedRaw(user, normalizedQueries.join(';').replaceAll(';;', ';'));

  if (!response.ok) {
    return { ok: false, error: response.output, data: null };
  }

  return {
    ok: true,
    data: { response: response.output },
    error: null,
  };
}
