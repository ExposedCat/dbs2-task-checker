import type { StateObservation } from '../state-comparison';
import { readDataset } from '../dataset.js';
import type { ServiceResponse } from '../response';
import { executeMongoDb } from './mongodb.js';
import { type ExecuteRedisArgs, executeRedis } from './redis';

export type BaseExecuteArgs = {
  queries: string[];
  noReset?: boolean;
  /** Optional restriction for trusted verification queries. */
  readOnly?: boolean;
  captureState?: boolean;
};

export type DatasetName = 'redis' | 'RedisBasic' | 'RedisAdvanced' | 'mongodb';

export type DatasetArgsMap = {
  redis: ExecuteRedisArgs;
};

export type ExecuteArgs = {
  datasetId: DatasetName;
} & BaseExecuteArgs;

export type ExecuteResult = ServiceResponse<{
  response: string;
  comparisonResponse?: string;
  skipped?: boolean;
  state?: StateObservation;
}>;

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
