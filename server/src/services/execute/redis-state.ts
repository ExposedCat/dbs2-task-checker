import { MAX_OUTPUT_BYTES } from './limits';

type Send = (args: (string | Buffer)[], buffered?: boolean) => Promise<unknown>;
const bytes = (value: unknown) => (value as Buffer).toString('base64');
function pairs(values: unknown): [string, string][] {
  const items = values as Buffer[];
  return Array.from({ length: items.length / 2 }, (_, index) => [bytes(items[2 * index]), bytes(items[2 * index + 1])]);
}
function fields(values: unknown): Record<string, unknown> {
  const items = values as unknown[];
  return Object.fromEntries(
    Array.from({ length: items.length / 2 }, (_, i) => [String(items[i * 2]), items[i * 2 + 1]]),
  );
}

/** Trusted reads run outside the submitted command stream on the same locked grading job. */
export async function redisSnapshot(send: Send): Promise<Record<string, unknown>> {
  const state: Record<string, unknown> = Object.create(null);
  let size = 0;
  const put = (key: string, value: unknown) => {
    size += Buffer.byteLength(JSON.stringify(value));
    if (size > MAX_OUTPUT_BYTES) throw new Error('Database state limit exceeded');
    state[key] = value;
  };
  for (const key of (await send(['KEYS', '*'], true)) as Buffer[]) {
    const type = (await send(['TYPE', key])) as string;
    let value: unknown;
    switch (type.toLowerCase()) {
      case 'none':
        continue;
      case 'string':
        value = bytes(await send(['GET', key], true));
        break;
      case 'hash':
        value = Object.fromEntries(pairs(await send(['HGETALL', key], true)));
        break;
      case 'set':
        value = ((await send(['SMEMBERS', key], true)) as Buffer[]).map(bytes).sort();
        break;
      case 'list':
        value = ((await send(['LRANGE', key, '0', '-1'], true)) as Buffer[]).map(bytes);
        break;
      case 'zset':
        value = pairs(await send(['ZRANGE', key, '0', '-1', 'WITHSCORES'], true));
        break;
      case 'rejson-rl':
        value = JSON.parse((await send(['JSON.GET', key])) as string);
        break;
      case 'stream': {
        const entries = (await send(['XRANGE', key, '-', '+'], true)) as [Buffer, Buffer[]][];
        const groups = (await send(['XINFO', 'GROUPS', key])) as unknown[][];
        value = {
          entries: entries.map(([id, data]) => [id.toString(), Object.fromEntries(pairs(data))]),
          groups: groups
            .map(group => {
              const info = fields(group);
              return { name: info.name, lastDeliveredId: info['last-delivered-id'], pending: info.pending };
            })
            .sort((a, b) => String(a.name).localeCompare(String(b.name))),
        };
        break;
      }
      default:
        throw new Error(`Unsupported Redis state type '${type}'`);
    }
    put(`key:${key.toString('base64')}`, { type, value, expiresAt: Number(await send(['PEXPIRETIME', key])) });
  }
  for (const index of (await send(['FT._LIST'])) as string[]) {
    const info = fields(await send(['FT.INFO', index]));
    put(`index:${index}`, {
      options: info.index_options,
      definition: info.index_definition,
      attributes: info.attributes,
    });
  }
  put('functions', await send(['FUNCTION', 'LIST', 'WITHCODE']));
  return state;
}

export function normalizeStreamReply(command: string[], reply: unknown, before: Record<string, unknown>): unknown {
  if (!['XRANGE', 'XREVRANGE'].includes(command[0].toUpperCase()) || !Array.isArray(reply)) return reply;
  const key = `key:${Buffer.from(command[1]).toString('base64')}`;
  const entry = before[key] as { value?: { entries?: [string, unknown][] } } | undefined;
  const ids = new Map(entry?.value?.entries?.map(([id], index) => [id, index]));
  return reply.map(([id, data]) => [ids.has(id) ? { seedStream: command[1], entry: ids.get(id) } : id, data]);
}
