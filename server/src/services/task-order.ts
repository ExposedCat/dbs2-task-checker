import type { Dataset } from './dataset';

/** Existing banks describe ordering in their question/reference, without extra metadata. */
export function taskOrderMatters(task: Dataset['bank'][number]): boolean {
  if (typeof task.orderMatters === 'boolean') return task.orderMatters;
  return (
    /\b(sorted|ascending|descending|ordered|order by|ranked)\b/i.test(task.question) ||
    task.solution.some(query =>
      /\.sort\s*\(|["']?\$sort["']?\s*:|^\s*(Z(?:REV)?RANGE\w*|L(?:RANGE|INDEX)|X(?:REV)?RANGE)\b/i.test(query),
    )
  );
}
