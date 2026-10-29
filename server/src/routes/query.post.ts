import Elysia, { t } from 'elysia';
import { RequireAuth } from '../middlewares/auth';
import { MAX_QUERIES, MAX_QUERY_BYTES, MAX_QUERY_LENGTH, withSubmissionSlot } from '../services/execute/limits';
import { executeQuestion, getUser } from '../services/user';

export const QueryRoute = new Elysia({ name: 'Route.Query' }).use(RequireAuth).post(
  '/query',
  async ({ user, body, database }) => {
    if (body.queries.reduce((bytes, query) => bytes + Buffer.byteLength(query), 0) > MAX_QUERY_BYTES) {
      return {
        ok: false,
        data: null,
        error: 'Query input limit exceeded (64 KiB)',
      };
    }
    try {
      return await withSubmissionSlot(
        async () => {
          // IDs are captured in the request, never rebound to a new task after a queue wait.
          const currentUser = await getUser({ database, userId: user._id.toString() });
          if (!currentUser) return { ok: false as const, data: null, error: 'Unauthorized' };
          return executeQuestion({ ...body, database, user: currentUser });
        },
        user.testSession?.datasetId === 'mongodb' ? `${user._id}:${body.sessionId}` : undefined,
      );
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
      sessionId: t.String({ minLength: 1 }),
      taskId: t.String({ minLength: 1 }),
      queries: t.Array(t.String({ maxLength: MAX_QUERY_LENGTH }), {
        maxItems: MAX_QUERIES,
      }),
    }),
  },
);
