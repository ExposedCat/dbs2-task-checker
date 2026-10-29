import { type StateObservation, normalizeMongoSnapshot } from '../state-comparison';
import { mongoExecutionId } from './context';
import { mongoExecutor } from './executor';
import type { BaseExecuteArgs, ExecuteResult } from './index';
import { prepareMongoResult } from './mongo-results';

type MongoStateWire = Omit<StateObservation, 'before' | 'after'> & { before: string; after: string };

// Submitted JavaScript runs in the pre-started executor, never in the API process.
export async function executeMongoDb({
  queries,
  noReset = false,
  readOnly = false,
  captureState = false,
}: BaseExecuteArgs): Promise<ExecuteResult> {
  try {
    const result = await mongoExecutor<{
      response: string;
      skipped?: boolean;
      protocolVersion?: number;
      state?: MongoStateWire;
    }>('/mongo', {
      queries: [prepareMongoResult(queries)],
      executionId: mongoExecutionId(),
      noReset,
      readOnly,
      captureState,
    });
    if (result.ok && result.data.protocolVersion !== 3) {
      return {
        ok: false,
        data: null,
        error: 'MongoDB executor update required (automatic state comparison)',
      };
    }
    if (!result.ok) return result;
    const { state, ...data } = result.data;
    if (!captureState) return { ...result, data };
    if (!state) return { ok: false, data: null, error: 'Database state observation missing' };
    return {
      ...result,
      data: {
        ...data,
        state: {
          ...state,
          before: normalizeMongoSnapshot(state.before),
          after: normalizeMongoSnapshot(state.after),
        },
      },
    };
  } catch {
    return { ok: false, data: null, error: 'Invalid MongoDB JavaScript' };
  }
}
