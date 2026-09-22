import { Elysia, t } from 'elysia';
import { RequireBase } from '../middlewares/base';
import { portalLogin } from '../services/portal-login';
import { startLoginApprovalSocket } from '../services/portal-login-socket';

const socketPath = process.env.PORTAL_LOGIN_SOCKET;
let approvalServer: ReturnType<typeof startLoginApprovalSocket> | undefined;

export const LoginRoute = new Elysia({ name: 'Route.Login' })
  .use(RequireBase)
  .onStart(({ decorator: { database } }) => {
    if (!socketPath) return;
    approvalServer = startLoginApprovalSocket(socketPath, async login => {
      const user = await database.users.findOne({ user: login, created: { $ne: false } }, { projection: { _id: 1 } });
      return user?._id.toString() ?? null;
    });
  })
  .onStop(() => {
    approvalServer?.stop(true);
  })
  .post('/login/start', ({ set }) => {
    set.headers['Cache-Control'] = 'no-store';
    if (!approvalServer) return { ok: false, data: null, error: 'SSH login is not configured on this server' };
    try {
      return {
        ok: true,
        data: { ...portalLogin.create(), command: process.env.PORTAL_LOGIN_COMMAND ?? 'portal-login' },
        error: null,
      };
    } catch (error) {
      return { ok: false, data: null, error: (error as Error).message };
    }
  })
  .post(
    '/login/poll',
    async ({ jwt, body, set }) => {
      set.headers['Cache-Control'] = 'no-store';
      try {
        const result = portalLogin.poll(body.pollToken);
        return {
          ok: true,
          error: null,
          data:
            result.status === 'pending'
              ? result
              : { status: 'approved', token: await jwt.sign({ userId: result.userId }) },
        };
      } catch (error) {
        return { ok: false, data: null, error: (error as Error).message };
      }
    },
    { body: t.Object({ pollToken: t.String({ pattern: '^[a-f0-9]{64}$' }) }) },
  );
