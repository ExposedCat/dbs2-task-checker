import { $, type ShellError } from 'bun';
import type { User } from '../user.js';
import type { BaseExecuteArgs, ExecuteResult } from './index.js';

// Sandbox MongoDB where student queries are executed (NOT the portal database)
const MONGO_SANDBOX_HOST = process.env.MONGO_SANDBOX_HOST ?? '127.0.0.1';
const MONGO_SANDBOX_PORT = process.env.MONGO_SANDBOX_PORT ?? '42222';
const MONGO_DATASET_PATH = `${process.cwd()}/datasets/mongodb/dataset.js`;

export type LoadMongodbArgs = Omit<BaseExecuteArgs, 'queries' | 'dataset'>;

export type LoadMongodbResponse = {
  response: string;
  ok: boolean;
};

/** mongosh connection arguments: authenticate as the student against their own database */
function mongoshArgs(user: User): string[] {
  const database = encodeURIComponent(user.user);
  return [
    '-u',
    database,
    '-p',
    encodeURIComponent(user.password),
    '--host',
    MONGO_SANDBOX_HOST,
    '--port',
    MONGO_SANDBOX_PORT,
    database,
  ];
}

async function executeAuthorizedRaw(user: User, command: string): Promise<{ ok: boolean; output: string }> {
  try {
    const result = await $`mongosh ${mongoshArgs(user)} --eval "${command}"`;
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
      await $`mongosh ${mongoshArgs(user)} --eval 'db.getCollectionNames().forEach(collection => db[collection].drop())'`;

      await $`mongosh ${mongoshArgs(user)} ${MONGO_DATASET_PATH}`;

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
