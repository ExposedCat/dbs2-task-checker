import { Elysia } from 'elysia';

import { getForcedUser } from '../services/force-user';
import { getUser } from '../services/user';
import { RequireBase } from './base.js';

export const RequireAuth = new Elysia({ name: 'Middleware.Auth' })
  .use(RequireBase)
  .onError({ as: 'local' }, ({ error }) => (error as Error).cause ?? 'Unknown error')
  .derive(async ({ database, jwt, headers }) => {
    const forcedUser = await getForcedUser(database);
    if (forcedUser) return { user: forcedUser };
    const token = headers['authorization'];
    const data = await jwt.verify(token);
    if (!data) {
      throw new Error('Unauthorized', {
        cause: {
          ok: false,
          data: null,
          error: 'Unauthorized',
        },
      });
    }
    const user = await getUser({ database, userId: data.userId });
    if (!user) {
      throw new Error('Unauthorized', {
        cause: {
          ok: false,
          data: null,
          error: 'Unauthorized',
        },
      });
    }
    return { user };
  })
  .as('plugin');
