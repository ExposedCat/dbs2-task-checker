import Elysia, { t } from 'elysia';
import { RequireAuth } from '../middlewares/auth';
import { expirePassword } from '../services/password-reset';

export const ResetPasswordRoute = new Elysia({ name: 'Route.ResetPassword' }) //
  .use(RequireAuth)
  .post(
    '/reset-password',
    async ({ user, body: { user: login } }) => {
      if (!user.admin) {
        return { ok: false, data: null, error: 'Unauthorized' };
      }
      return await expirePassword({ login });
    },
    { body: t.Object({ user: t.String() }) },
  );
