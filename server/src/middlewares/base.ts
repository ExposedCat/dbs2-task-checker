import { jwt as jwtPlugin } from '@elysiajs/jwt';
import { Elysia, t } from 'elysia';

import cors from '@elysiajs/cors';
import { createDbConnection } from '../services/database';

export const RequireBase = new Elysia({ name: 'Middleware.Base' })
  .use(
    cors({
      origin: true,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  )
  .use(
    jwtPlugin({
      name: 'jwt',
      secret: process.env.JWT_SECRET as string,
      schema: t.Object({
        userId: t.String(),
      }),
    }),
  )
  .on('error', ({ error }) => {
    if (error.message !== 'Unauthorized') {
      console.error(error);
    }
    return { ok: false, data: null, error: error.message ?? 'Unknown error' };
  })
  .decorate(
    'database', //
    await createDbConnection(process.env.DB_CONNECTION_URL ?? 'mongodb://127.0.0.1:27017'),
  )
  .as('plugin');
