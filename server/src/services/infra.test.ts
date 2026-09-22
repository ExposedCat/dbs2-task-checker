import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkInfra, probeGradingRedis } from './infra';
import type { Database } from './database';

test('reports every student, including missing ports, and distinguishes Redis reachability', async () => {
  const live = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: {
    data(socket) { socket.end('-NOAUTH Authentication required.\r\n'); },
  } });
  const closed = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: {
    data(socket) { socket.end(); },
  } });
  let filter: unknown;
  const database = { users: {
    estimatedDocumentCount: async () => 4,
    find(value: unknown) {
      filter = value;
      return { toArray: async () => [
        { user: 'f26_live', port: live.port },
        { user: 'f26_closed', port: closed.port },
        { user: 'f26_missing' },
        { user: 'f25_invalid', port: 0 },
      ] };
    },
  } } as unknown as Database;
  try {
    const report = await checkInfra({ database });
    expect(filter).toEqual({ admin: { $ne: true } });
    expect(report.ok).toBe(true);
    if (!report.ok) throw new Error(report.error);
    expect(report.data.redis.map(({ user, status, ok }) => ({ user, status, ok }))).toEqual([
      { user: 'f26_live', status: 'up', ok: true },
      { user: 'f26_closed', status: 'down', ok: false },
      { user: 'f26_missing', status: 'unconfigured', ok: false },
      { user: 'f25_invalid', status: 'unconfigured', ok: false },
    ]);
    expect(report.data.redis[2].port).toBeNull();
  } finally {
    live.stop(true);
    closed.stop(true);
  }
}, 10000);


test('grading Redis requires PONG from its private socket and reports unavailable sockets', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'grading-probe-'));
  const path = join(directory, 'redis.sock');
  let reply = '+PONG\r\n';
  const server = Bun.listen({ unix: path, socket: {
    data(socket, data) {
      expect(data.toString()).toBe('*1\r\n$4\r\nPING\r\n');
      socket.end(reply);
    },
  } });
  try {
    expect((await probeGradingRedis(path)).ok).toBe(true);
    reply = '-NOAUTH Authentication required\r\n';
    expect((await probeGradingRedis(path)).ok).toBe(false);
    expect((await probeGradingRedis(undefined)).ok).toBe(false);
    expect((await probeGradingRedis(join(directory, 'missing.sock'))).ok).toBe(false);
  } finally {
    server.stop(true);
    rmSync(directory, { recursive: true, force: true });
  }
});
