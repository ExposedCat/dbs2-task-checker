import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PortalLogin } from './portal-login';
import { startLoginApprovalSocket } from './portal-login-socket';

test('code alone cannot redeem; approval binds identity and is redeemed once', () => {
  const login = new PortalLogin();
  const challenge = login.create();
  expect(() => login.poll(challenge.code)).toThrow();
  expect(login.poll(challenge.pollToken)).toEqual({ status: 'pending' });
  expect(login.approve(challenge.code, 'student-id')).toBe(true);
  expect(login.approve(challenge.code, 'other-id')).toBe(false);
  expect(login.poll(challenge.pollToken)).toEqual({ status: 'approved', userId: 'student-id' });
  expect(() => login.poll(challenge.pollToken)).toThrow();
  expect(login.approve(challenge.code, 'student-id')).toBe(false);
});

test('expires both pending and approved codes', () => {
  let now = 10000;
  const login = new PortalLogin(() => now);
  const pending = login.create();
  const approved = login.create();
  login.approve(approved.code, 'student-id');
  expect(pending.expiresAt).toBe(now + 60_000);
  now += 59_999;
  expect(login.poll(pending.pollToken)).toEqual({ status: 'pending' });
  now += 1;
  expect(login.approve(pending.code, 'student-id')).toBe(false);
  expect(() => login.poll(pending.pollToken)).toThrow();
  expect(() => login.poll(approved.pollToken)).toThrow();
});

test('bounds anonymous challenge creation', () => {
  const login = new PortalLogin();
  for (let i = 0; i < 120; i++) login.create();
  expect(() => login.create()).toThrow('Too many');
});

test('private socket has mode 0600, rejects unknown accounts, and approves valid codes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'portal-login-'));
  const path = join(directory, 'approve.sock');
  const login = new PortalLogin();
  const challenge = login.create();
  const server = startLoginApprovalSocket(path, async name => (name === 'student' ? 'student-id' : null), login);
  try {
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const request = (name: string) =>
      fetch('http://localhost/approve', {
        unix: path,
        method: 'POST',
        body: JSON.stringify({ code: challenge.code, login: name }),
      });
    expect((await request('unknown')).status).toBe(400);
    expect((await request('student')).status).toBe(200);
    expect((await request('student')).status).toBe(400);
    expect(login.poll(challenge.pollToken)).toEqual({ status: 'approved', userId: 'student-id' });
  } finally {
    await server.stop(true);
    rmSync(directory, { recursive: true, force: true });
  }
});
