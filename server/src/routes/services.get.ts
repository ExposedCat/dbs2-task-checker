import Elysia from 'elysia';
import { RequireAuth } from '../middlewares/auth';
import { checkInfra } from '../services/infra';

export const ServicesRoute = new Elysia({ name: 'Route.Services' }) //
  .use(RequireAuth)
  .get('/services', async ({ database, user }) => {
    if (!user.admin) {
      return { ok: false, data: null, error: 'Unauthorized' };
    }
    return await checkInfra({ database });
  });
