import Elysia, { t } from 'elysia';
import { RequireAuth } from '../middlewares/auth';
import { createUsers, parseNewUsers } from '../services/user-creation';

export const CreateUsersRoute = new Elysia({ name: 'Route.CreateUsers' })
  .use(RequireAuth)
  .post('/create-users', async ({ database, user, body }) => {
    if (!user.admin) return { ok: false, data: null, error: 'Unauthorized' };
    try {
      return await createUsers(database, parseNewUsers(body.users, body.fileText));
    } catch (error) {
      return { ok: false, data: null, error: error instanceof Error ? error.message : 'Invalid users' };
    }
  }, { body: t.Object({
    users: t.Array(t.Object({ name: t.String(), password: t.String() }), { maxItems: 500 }),
    fileText: t.Optional(t.String({ maxLength: 900000 })),
  }) });
