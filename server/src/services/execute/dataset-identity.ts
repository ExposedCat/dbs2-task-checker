import { createHash } from 'node:crypto';
import type { DatasetName } from './index';

export function executionDatasetPath(datasetId: DatasetName) {
  return `${process.cwd()}/datasets/${datasetId === 'mongodb' ? 'mongodb/dataset.js' : 'redis/dataset.txt'}`;
}

export async function executionDatasetHash(datasetId: DatasetName) {
  const bytes = await Bun.file(executionDatasetPath(datasetId)).arrayBuffer();
  return createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
}
