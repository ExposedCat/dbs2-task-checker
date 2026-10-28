import type { Dataset } from './dataset';
import { execute, type DatasetName } from './execute';
import { MAX_QUERIES, MAX_QUERY_LENGTH, MAX_QUERY_BYTES } from './execute/limits';
import { stateChanges } from './state-comparison';
import { parseReplies } from './comparison';

export function validateTask(task: Dataset['bank'][number]): string | null {
  if (typeof task.question !== 'string' || !task.question.trim()) return 'Question is required';
  if (
    !Array.isArray(task.solution) ||
    !task.solution.length ||
    task.solution.length > MAX_QUERIES ||
    task.solution.some(query => typeof query !== 'string' || !query.trim() || query.length > MAX_QUERY_LENGTH)
  ) {
    return 'Solution must contain nonempty commands within the query limits';
  }
  if (task.solution.reduce((bytes, query) => bytes + Buffer.byteLength(query), 0) > MAX_QUERY_BYTES) {
    return 'Solution exceeds the query input limit';
  }
  if (
    task.test !== null &&
    (typeof task.test !== 'string' || !task.test.trim() || task.test.length > MAX_QUERY_LENGTH)
  ) {
    return 'Test must be a nonempty verification query';
  }
  if (task.orderMatters !== undefined && typeof task.orderMatters !== 'boolean')
    return 'OrderMatters must be a boolean';
  return null;
}

/** Caller holds the shared execution slot through the complete validation batch. */
export async function validateReference(datasetId: DatasetName, task: Dataset['bank'][number]): Promise<void> {
  const result = await execute({ datasetId, queries: task.solution, captureState: !task.test });
  if (!result.ok || result.data.skipped) throw new Error('Reference solution failed');
  if (task.test) {
    const verification = await execute({ datasetId, queries: [task.test], noReset: true });
    if (!verification.ok || verification.data.skipped) throw new Error('Reference verification query failed');
    parseReplies(verification.data.response);
  } else {
    if (!result.data.state) throw new Error('Reference database state missing');
    if (!Object.keys(stateChanges(result.data.state)).length) parseReplies(result.data.response);
  }
}
