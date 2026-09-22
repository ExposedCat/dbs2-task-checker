import Elysia, { t } from 'elysia';
import { RequireAuth } from '../middlewares/auth';
import type { ServiceResponse } from '../services/response';
import { MAX_QUERIES, MAX_QUERY_LENGTH, MAX_QUERY_BYTES, withSubmissionSlot } from '../services/execute/limits';
import { executeQuestion, getUser } from '../services/user';

export const QueryRoute = new Elysia({ name: 'Route.Query' }).use(RequireAuth).post(
  '/query',
  async ({ user, body, database }): Promise<ServiceResponse<{ result: number | null }>> => {
    if (body.queries.reduce((bytes, query) => bytes + Buffer.byteLength(query), 0) > MAX_QUERY_BYTES) {
      return {
        ok: false,
        data: null,
        error: 'Query input limit exceeded (64 KiB)',
      };
    }
    try {
      return await withSubmissionSlot(async () => {
        // Requests may wait in the queue: load the current task only when work begins.
        const currentUser = await getUser({ database, userId: user._id.toString() });
        if (!currentUser) return { ok: false as const, data: null, error: 'Unauthorized' };
        return executeQuestion({ ...body, database, user: currentUser });
      });
    } catch (error) {
      return {
        ok: false,
        data: null,
        error: error instanceof Error ? error.message : 'Query execution failed',
      };
    }
  },
  {
    body: t.Object({
      queries: t.Array(t.String({ maxLength: MAX_QUERY_LENGTH }), {
        maxItems: MAX_QUERIES,
      }),
    }),
  },
);
