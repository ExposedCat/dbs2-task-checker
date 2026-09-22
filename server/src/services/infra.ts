import { createConnection, type NetConnectOpts } from 'node:net';

import type { Database } from './database';
import type { ServiceResponse } from './response';

// Read-only readiness checks of the infrastructure, made from the API container without any
// credentials (same idea as ~/infra/bin/health on the host):
// - the portal MongoDB through the driver,
// - the sandbox MongoDB and every student Redis instance the portal knows about (TCP + PING),
// - any additional endpoints listed in INFRA_SERVICES, e.g.
//     INFRA_SERVICES="PostgreSQL=tcp://host:5432,Neo4j=http://host:7474/,HDFS=http://host:9870/"
//   (`tcp://` = the port accepts connections, `http://` = the URL answers with a 2xx/3xx).

const MONGO_SANDBOX_HOST = process.env.MONGO_SANDBOX_HOST ?? '127.0.0.1';
const MONGO_SANDBOX_PORT = Number(process.env.MONGO_SANDBOX_PORT ?? '42222');
const REDIS_SANDBOX_HOST = process.env.REDIS_SANDBOX_HOST ?? '127.0.0.1';
const PROBE_TIMEOUT_MS = 4000;

export type ProbeResult = {
  ok: boolean;
  /** Round-trip time of the check; null when it failed before completing */
  latencyMs: number | null;
  /** Error text when down, a short note when up */
  detail: string | null;
};

export type ServiceStatus = ProbeResult & {
  name: string;
  /** What was probed, for display (host:port or URL) */
  target: string;
};

export type RedisInstanceStatus = ProbeResult & {
  user: string;
  port: number | null;
  status: 'up' | 'down' | 'unconfigured';
};

export type InfraReport = {
  checkedAt: number;
  services: ServiceStatus[];
  redis: RedisInstanceStatus[];
};

function timed<T>(check: () => Promise<T>): Promise<T & { latencyMs: number }> {
  const started = performance.now();
  return check().then(result => ({ ...result, latencyMs: Math.round(performance.now() - started) }));
}

/** Opens a TCP or Unix socket; optionally sends a payload and reads one bounded RESP line. */
function socketProbe(options: NetConnectOpts, payload?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(options);
    let reply = '';
    const fail = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS, () => fail(new Error(`Timeout after ${PROBE_TIMEOUT_MS} ms`)));
    socket.once('error', fail);
    socket.once('connect', () => {
      if (payload === undefined) {
        socket.end();
        resolve('');
        return;
      }
      socket.write(payload);
    });
    socket.once('end', () => fail(new Error('Connection closed without a response')));
    socket.on('data', chunk => {
      reply += chunk.toString();
      if (reply.length > 4096) return fail(new Error('Probe response exceeds limit'));
      if (reply.includes('\r\n')) {
        socket.destroy();
        resolve(reply);
      }
    });
  });
}

async function probeTcp(host: string, port: number): Promise<ProbeResult> {
  try {
    return await timed(async () => {
      await socketProbe({ host, port });
      return { ok: true, detail: null };
    });
  } catch (error) {
    return { ok: false, latencyMs: null, detail: String(error instanceof Error ? error.message : error) };
  }
}

async function probeHttp(url: string): Promise<ProbeResult> {
  try {
    return await timed(async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), redirect: 'manual' });
      const ok = response.status < 400;
      return { ok, detail: `HTTP ${response.status}` };
    });
  } catch (error) {
    return { ok: false, latencyMs: null, detail: String(error instanceof Error ? error.message : error) };
  }
}

/** PING without authenticating: a live instance answers +PONG or -NOAUTH, anything else is wrong */
async function probeRedis(host: string, port: number): Promise<ProbeResult> {
  try {
    return await timed(async () => {
      const reply = await socketProbe({ host, port }, '*1\r\n$4\r\nPING\r\n');
      const ok = reply.startsWith('+PONG') || reply.startsWith('-NOAUTH');
      return { ok, detail: ok ? null : `Unexpected reply: ${reply.trim().slice(0, 60)}` };
    });
  } catch (error) {
    return { ok: false, latencyMs: null, detail: String(error instanceof Error ? error.message : error) };
  }
}

export async function probeGradingRedis(path: string | undefined): Promise<ProbeResult> {
  if (!path) return { ok: false, latencyMs: null, detail: 'Grading Redis socket is not configured' };
  try {
    return await timed(async () => {
      const reply = await socketProbe({ path }, '*1\r\n$4\r\nPING\r\n');
      const ok = reply === '+PONG\r\n';
      return { ok, detail: ok ? null : `Unexpected reply: ${reply.trim().slice(0, 60)}` };
    });
  } catch (error) {
    return { ok: false, latencyMs: null, detail: String(error instanceof Error ? error.message : error) };
  }
}

async function probePortalDatabase(database: Database): Promise<ProbeResult> {
  try {
    return await timed(async () => {
      const users = await database.users.estimatedDocumentCount();
      return { ok: true, detail: `${users} users` };
    });
  } catch (error) {
    return { ok: false, latencyMs: null, detail: String(error instanceof Error ? error.message : error) };
  }
}

/** Parses INFRA_SERVICES ("Name=tcp://host:port,Other=http://host:port/") */
export function parseExtraServices(spec: string | undefined): { name: string; url: URL }[] {
  if (!spec?.trim()) return [];
  const services: { name: string; url: URL }[] = [];
  for (const entry of spec.split(',')) {
    const separator = entry.indexOf('=');
    try {
      if (separator === -1) throw new Error('missing "="');
      const name = entry.slice(0, separator).trim();
      const url = new URL(entry.slice(separator + 1).trim());
      if (!name) throw new Error('empty name');
      if (!['tcp:', 'http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
      if (url.protocol === 'tcp:' && !url.port) throw new Error('missing port');
      services.push({ name, url });
    } catch (error) {
      console.warn(
        `INFRA_SERVICES: ignoring '${entry.trim()}' (${error instanceof Error ? error.message : error}; expected Name=tcp://host:port or Name=http://host:port/)`,
      );
    }
  }
  return services;
}

const EXTRA_SERVICES = parseExtraServices(process.env.INFRA_SERVICES);

export type CheckInfraArgs = {
  database: Database;
};

export async function checkInfra({ database }: CheckInfraArgs): Promise<ServiceResponse<InfraReport>> {
  const users = await database.users
    // Include every student, including accounts without an assigned Redis instance.
    .find({ admin: { $ne: true } }, { projection: { user: 1, port: 1 }, sort: { user: 1 } })
    .toArray();

  const [portal, sandbox, extra, redis, gradingRedis] = await Promise.all([
    probePortalDatabase(database),
    probeTcp(MONGO_SANDBOX_HOST, MONGO_SANDBOX_PORT),
    Promise.all(
      EXTRA_SERVICES.map(async ({ name, url }) => ({
        name,
        target: url.protocol === 'tcp:' ? `${url.hostname}:${url.port}` : url.href,
        ...(url.protocol === 'tcp:' ? await probeTcp(url.hostname, Number(url.port)) : await probeHttp(url.href)),
      })),
    ),
    Promise.all(
      users.map(async ({ user, port }): Promise<RedisInstanceStatus> => {
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          return { user, port: null, status: 'unconfigured', ok: false, latencyMs: null, detail: 'No valid Redis port assigned' };
        }
        const result = await probeRedis(REDIS_SANDBOX_HOST, port);
        return { user, port, ...result, status: result.ok ? 'up' : 'down' };
      }),
    ),
    probeGradingRedis(process.env.REDIS_GRADING_SOCKET),
  ]);

  return {
    ok: true,
    error: null,
    data: {
      checkedAt: Date.now(),
      services: [
        { name: 'Portal MongoDB', target: 'portal database', ...portal },
        { name: 'Sandbox MongoDB', target: `${MONGO_SANDBOX_HOST}:${MONGO_SANDBOX_PORT}`, ...sandbox },
        { name: 'Sandbox Redis', target: 'shared grading instance', ...gradingRedis },
        ...extra,
      ],
      redis,
    },
  };
}
