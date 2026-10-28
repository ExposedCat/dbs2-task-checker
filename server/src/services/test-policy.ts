import type { Dataset } from './dataset';
import type { Submission } from './user';

export function requiredPoints(dataset: Pick<Dataset, 'kinds' | 'minPoints'>): number {
  // Existing banks retain ten points for long tests; short tests can be passed.
  return (
    dataset.minPoints ??
    Math.min(
      10,
      Object.values(dataset.kinds).reduce((sum, count) => sum + count, 0),
    )
  );
}

export function hasPassed(submissions: Submission[], datasetId: string, minPoints: number): boolean {
  return submissions.some(
    submission =>
      submission.datasetId === datasetId &&
      (submission.passed ?? submission.grade >= (submission.minPoints ?? minPoints)),
  );
}

export function validateTestPolicy(dataset: Pick<Dataset, 'bank' | 'kinds' | 'minPoints'>): string | null {
  let total = 0;
  for (const [kind, count] of Object.entries(dataset.kinds)) {
    if (!Number.isInteger(count) || count < 0 || count > dataset.bank.filter(task => task.kind === kind).length) {
      return `Invalid question count for category '${kind}'`;
    }
    total += count;
  }
  const points = requiredPoints(dataset);
  return !Number.isInteger(points) || points < 1 || points > total
    ? 'Passing points must be an integer between 1 and the number of selected questions'
    : null;
}
