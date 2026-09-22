import Elysia, { t } from 'elysia';
import { RequireAuth } from '../middlewares/auth';
import { isUserCreationPending } from '../services/user-creation';
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
      if (isUserCreationPending(login)) return { ok: false, data: null, error: 'Account creation is still in progress' };
      return await deleteUser({ login });
    },
    { body: t.Object({ user: t.String() }) },
  );
