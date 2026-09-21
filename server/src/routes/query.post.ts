import Elysia, { t } from 'elysia';
import { RequireAuth } from '../middlewares/auth';
import type { ServiceResponse } from '../services/response';
import { executeQuestion } from '../services/user';

export const QueryRoute = new Elysia({ name: 'Route.Query' }).use(RequireAuth).post(
  '/query',
  async ({ user, body, database }): Promise<ServiceResponse<{ result: number | null }>> => {
    return await executeQuestion({ ...body, database, user });
  },
  {
    body: t.Object({ queries: t.Array(t.String()) }),
  },
);
