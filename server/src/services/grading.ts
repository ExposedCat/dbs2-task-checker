import { parseCommand } from './escape';
import { compareResponses } from './comparison';
import type { Dataset } from './dataset';
import type { ReferenceResult } from './reference-cache';
import { sameStateChanges, stateChanges } from './state-comparison';
import { taskOrderMatters } from './task-order';

export function compareTaskResults(
  task: Dataset['bank'][number],
  reference: ReferenceResult,
  submission: ReferenceResult,
): boolean {
  const outputsMatch = () =>
    compareResponses(
      task.test ? reference.testResponse! : reference.response,
      task.test ? submission.testResponse! : submission.response,
      taskOrderMatters(task),
      task.test ? reference.testComparisonResponse : reference.comparisonResponse,
      task.test ? submission.testComparisonResponse : submission.comparisonResponse,
    );
  if (task.test) return outputsMatch();
  return (
    !!reference.state &&
    !!submission.state &&
    sameStateChanges(
      reference.state,
      submission.state,
      [...task.solution.join('\n').matchAll(/["']([a-f0-9]{24})["']/gi)]
        .map(match => match[1])
        .concat(
          reference.state.engine === 'redis'
            ? task.solution.flatMap(parseCommand).filter(token => /^\d+-\d+$/.test(token))
            : [],
        ),
    ) &&
    (Object.keys(stateChanges(reference.state)).length > 0 || outputsMatch())
  );
}
