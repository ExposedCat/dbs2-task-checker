import { chmodSync, lstatSync, unlinkSync } from 'node:fs';
import { portalLogin, type PortalLogin } from './portal-login';

/** Never expose this listener over TCP or through the public reverse proxy. */
export function startLoginApprovalSocket(
  path: string,
  lookupUser: (login: string) => Promise<string | null>,
  login: PortalLogin = portalLogin,
) {
  try {
    if (!lstatSync(path).isSocket()) throw new Error('Login socket path is occupied by a non-socket file');
    unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const mask = process.umask(0o077);
  try {
    const server = Bun.serve({
      unix: path,
      maxRequestBodySize: 1024,
      async fetch(request) {
        if (request.method !== 'POST' || new URL(request.url).pathname !== '/approve')
          return new Response(null, { status: 404 });
        try {
          const body = await request.json();
          if (
            !body ||
            typeof body.code !== 'string' ||
            !/^[A-F0-9]{4}(?:-[A-F0-9]{4}){3}$/.test(body.code) ||
            typeof body.login !== 'string' ||
            !/^[a-z_][a-z0-9_-]{0,63}$/.test(body.login)
          ) {
            return Response.json({ ok: false, error: 'Invalid approval request' }, { status: 400 });
          }
          const userId = await lookupUser(body.login);
          if (!userId || !login.approve(body.code, userId)) {
            return Response.json(
              { ok: false, error: 'Unknown portal account, expired code, or code already approved' },
              { status: 400 },
            );
          }
          return Response.json({ ok: true });
        } catch {
          return Response.json({ ok: false, error: 'Unable to approve login' }, { status: 400 });
        }
      },
    });
    chmodSync(path, process.env.PORTAL_LOGIN_SOCKET_MODE === '666' ? 0o666 : 0o600);
    return server;
  } finally {
    process.umask(mask);
  }
}
