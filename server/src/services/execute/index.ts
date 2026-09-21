import { readDataset } from '../dataset.js';
import type { ServiceResponse } from '../response';
import type { User } from '../user';
import { executeMongoDb } from './mongodb.js';
import { type ExecuteRedisArgs, executeRedis } from './redis';

export type BaseExecuteArgs = {
  queries: string[];
  user: User;
  noReset?: boolean;
};

export type DatasetName = 'redis' | 'RedisBasic' | 'RedisAdvanced' | 'mongodb';

export type DatasetArgsMap = {
  redis: ExecuteRedisArgs;
};

export type ExecuteArgs = {
  datasetId: DatasetName;
} & BaseExecuteArgs;

export type ExecuteResult = ServiceResponse<{ response: string; skipped?: boolean }>;

// FIXME: Move to service
const { ok, data: redisDataset } = await readDataset({
  datasetId: 'redis',
  format: 'json',
});

export function execute({ datasetId, ...args }: ExecuteArgs): Promise<ExecuteResult> {
  if (!ok) {
    throw redisDataset;
  }

  switch (datasetId) {
    case 'redis':
    case 'RedisBasic':
    case 'RedisAdvanced':
      return executeRedis({ ...args, dataset: redisDataset });

    case 'mongodb':
      return executeMongoDb(args);

    default:
      throw new Error(`Unsupported dataset '${datasetId}'`);
  }
}
