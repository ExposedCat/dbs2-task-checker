import { normalizeMongoSnapshot, type StateObservation } from '../state-comparison';
import type { BaseExecuteArgs, ExecuteResult } from './index';
import { prepareMongoResult } from './mongo-results';
import { gradingBroker } from './broker';

type MongoStateWire = Omit<StateObservation, 'before' | 'after'> & { before: string; after: string };

// No student credentials or local mongosh execution in the portal process.
export async function executeMongoDb({
  queries,
  noReset = false,
  readOnly = false,
  captureState = false,
}: BaseExecuteArgs): Promise<ExecuteResult> {
  try {
    const result = await gradingBroker<{
      response: string;
      skipped?: boolean;
      protocolVersion?: number;
      state?: MongoStateWire;
    }>('/mongo', {
      queries: [prepareMongoResult(queries)],
      noReset,
      readOnly,
      captureState,
    });
    if (result.ok && result.data.protocolVersion !== 3) {
      return {
        ok: false,
        data: null,
        error: 'Grading broker update required (automatic state comparison)',
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
