import Elysia from 'elysia';

export const RequireErrorFallback = new Elysia({ name: 'Middleware.ErrorFallback' }).all('*', ({ error }) =>
  error(404, {
    ok: false,
    data: null,
    error: 'Route Not Found',
  }),
);
