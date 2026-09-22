import { expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { MongoClient } from 'mongodb';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const integration = process.env.TEST_LOGIN_DB ? test : test.skip;

integration('browser challenge -> private SSH approval -> expiring JWT, without password login', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'portal-login-route-'));
  const socket = join(dir, 'approve.sock');
  process.env.PORTAL_LOGIN_SOCKET = socket;
  process.env.JWT_SECRET = 'test-secret-only-not-for-production';
  process.env.DB_CONNECTION_URL = process.env.TEST_LOGIN_DB;
  const client = new MongoClient(process.env.TEST_LOGIN_DB!);
  await client.connect();
  const users = client.db('portal').collection('users');
  await users.insertOne({ user: 'ssh-student', admin: false }); // No password necessary to log in.
  const { LoginRoute } = await import('./login.post');
  const app = new Elysia().use(LoginRoute).listen(0);
  const request = (path: string, body: object) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  try {
    const start = await request('/login/start', {});
    expect(start.headers.get('Cache-Control')).toBe('no-store');
    const challenge = (await start.json()).data;
    expect(challenge.code).toMatch(/^[A-F0-9]{4}(?:-[A-F0-9]{4}){3}$/);
    expect((await (await request('/login/poll', { pollToken: challenge.pollToken })).json()).data.status).toBe(
      'pending',
    );
    expect((await request('/approve', { code: challenge.code, login: 'ssh-student' })).status).toBe(404);
    const approve = await fetch('http://localhost/approve', {
      unix: socket,
      method: 'POST',
      body: JSON.stringify({ code: challenge.code, login: 'ssh-student' }),
    });
    expect(approve.status).toBe(200);
    const result = await (await request('/login/poll', { pollToken: challenge.pollToken })).json();
    expect(result.data.status).toBe('approved');
    const claims = JSON.parse(Buffer.from(result.data.token.split('.')[1], 'base64url').toString());
    expect(claims.userId).toBe((await users.findOne({ user: 'ssh-student' }))!._id.toString());
    expect(claims.exp).toBeGreaterThan(Date.now() / 1000);
    expect((await (await request('/login/poll', { pollToken: challenge.pollToken })).json()).ok).toBe(false);
    expect((await request('/login', { login: 'ssh-student', password: 'anything' })).status).toBe(404);
  } finally {
    await app.stop();
    await client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
