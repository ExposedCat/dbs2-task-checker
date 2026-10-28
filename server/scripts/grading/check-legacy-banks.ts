// Read-only compatibility check of existing question banks, on disposable grading engines.
// LEGACY_BANKS_FILE contains exported stored datasets ({ id, bank }[]).
import { execute, type DatasetName } from '../../src/services/execute';
import { compareTaskResults } from '../../src/services/grading';
import { validateTask } from '../../src/services/task-validation';
import type { Dataset } from '../../src/services/dataset';
import type { ReferenceResult } from '../../src/services/reference-cache';

if (!process.env.LEGACY_BANKS_FILE || process.env.RUN_LEGACY_BANK_INTEGRATION !== '1') {
  throw new Error('Set LEGACY_BANKS_FILE and RUN_LEGACY_BANK_INTEGRATION=1; use only disposable grading engines');
}
const datasets = (await Bun.file(process.env.LEGACY_BANKS_FILE).json()) as Dataset[];
let checked = 0;
const failures: string[] = [];
for (const dataset of datasets) {
  if (process.env.LEGACY_DATASET_ID && dataset.id !== process.env.LEGACY_DATASET_ID) continue;
  const run = async (task: Dataset['bank'][number]): Promise<ReferenceResult> => {
    const result = await execute({
      datasetId: dataset.id as DatasetName,
      queries: task.solution,
      captureState: !task.test,
    });
    if (!result.ok) throw new Error(result.error);
    const verified = task.test
      ? await execute({ datasetId: dataset.id as DatasetName, queries: [task.test], noReset: true })
      : null;
    if (verified && !verified.ok) throw new Error(verified.error);
    return {
      response: result.data.response,
      comparisonResponse: result.data.comparisonResponse,
      state: result.data.state,
      testResponse: verified?.ok ? verified.data.response : null,
      testComparisonResponse: verified?.ok ? verified.data.comparisonResponse : undefined,
    };
  };
  for (const [index, task] of dataset.bank.entries()) {
    try {
      const shapeError = validateTask(task);
      if (shapeError) throw new Error(shapeError);
      const reference = await run(task);
      const submission = await run(task);
      if (!compareTaskResults(task, reference, submission))
        throw new Error('Reference rejected as its own submission after reset');
      checked++;
    } catch (error) {
      failures.push(`${dataset.id} question ${index + 1}: ${String(error)}`);
    }
    if ((index + 1) % 10 === 0 || index + 1 === dataset.bank.length)
      console.log(`${dataset.id}: ${index + 1}/${dataset.bank.length}, failures: ${failures.length}`);
  }
}
console.log(JSON.stringify({ checked, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
