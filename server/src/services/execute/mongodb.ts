import type { BaseExecuteArgs, ExecuteResult } from './index';
import { gradingBroker } from './broker';

// No student credentials or local mongosh execution in the portal process.
export function executeMongoDb({ queries, noReset = false }: BaseExecuteArgs): Promise<ExecuteResult> {
  return gradingBroker('/mongo', { queries, noReset });
}
