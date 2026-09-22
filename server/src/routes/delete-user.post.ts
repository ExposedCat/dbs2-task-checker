import Elysia, { t } from 'elysia';
import { RequireAuth } from '../middlewares/auth';
import { deleteUser } from '../services/user-deletion';

export const DeleteUserRoute = new Elysia({ name: 'Route.DeleteUser' }) //
  .use(RequireAuth)
  .post(
    '/delete-user',
    async ({ database, user, body: { user: login } }) => {
      if (!user.admin) {
        return { ok: false, data: null, error: 'Unauthorized' };
      }
      if (!await database.users.findOne({ user: login }, { projection: { _id: 1 } })) {
        return { ok: false, data: null, error: 'User not found' };
      }
      return await deleteUser({ login });
    },
    { body: t.Object({ user: t.String() }) },
  );
