import Elysia from 'elysia';
import { RequireAuth } from '../middlewares/auth';
import { listUsers } from '../services/user';

export const UsersRoute = new Elysia({ name: 'Route.Users' }) //
  .use(RequireAuth)
  .get('/users', async ({ database, user }) => {
    if (!user.admin) {
      return { ok: false, data: null, error: 'Unauthorized' };
    }
    return await listUsers({ database });
  });
