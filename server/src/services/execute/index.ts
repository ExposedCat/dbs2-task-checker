import { readDataset } from '../dataset.js';
import type { ServiceResponse } from '../response';
import { executeMongoDb } from './mongodb.js';
import { type ExecuteRedisArgs, executeRedis } from './redis';

export type BaseExecuteArgs = {
  queries: string[];
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

export async function execute({ datasetId, ...args }: ExecuteArgs): Promise<ExecuteResult> {
  switch (datasetId) {
    case 'redis':
    case 'RedisBasic':
    case 'RedisAdvanced': {
      // Read on each reset so content-hash invalidation matches what is actually loaded.
      const dataset = await readDataset({ datasetId: 'redis', format: 'json' });
      if (!dataset.ok) return dataset;
      return executeRedis({ ...args, dataset: dataset.data });
    }
    case 'mongodb':
      return executeMongoDb(args);
    default:
      throw new Error(`Unsupported dataset '${datasetId}'`);
  }
}
