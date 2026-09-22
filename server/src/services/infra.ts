import { createConnection } from 'node:net';

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
  port: number;
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

/** Opens a TCP connection; optionally sends a payload and returns the first reply */
function tcpProbe(host: string, port: number, payload?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
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
    socket.once('data', chunk => {
      socket.end();
      resolve(chunk.toString());
    });
  });
}

async function probeTcp(host: string, port: number): Promise<ProbeResult> {
  try {
    return await timed(async () => {
      await tcpProbe(host, port);
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
      const reply = await tcpProbe(host, port, '*1\r\n$4\r\nPING\r\n');
      const ok = reply.startsWith('+PONG') || reply.startsWith('-NOAUTH');
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
    // `$gt: 0` also skips legacy records without a port (comparison only matches numbers)
    .find({ port: { $gt: 0 } }, { projection: { user: 1, port: 1 }, sort: { user: 1 } })
    .toArray();

  const [portal, sandbox, extra, redis] = await Promise.all([
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
      users.map(async ({ user, port }) => ({
        user,
        port,
        ...(await probeRedis(REDIS_SANDBOX_HOST, port)),
      })),
    ),
  ]);

  return {
    ok: true,
    error: null,
    data: {
      checkedAt: Date.now(),
      services: [
        { name: 'Portal MongoDB', target: 'portal database', ...portal },
        { name: 'Sandbox MongoDB', target: `${MONGO_SANDBOX_HOST}:${MONGO_SANDBOX_PORT}`, ...sandbox },
        ...extra,
      ],
      redis,
    },
  };
}
