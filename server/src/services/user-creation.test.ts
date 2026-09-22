import { afterAll, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUsers, isUserCreationPending, parseNewUsers, provisionUser } from './user-creation';
import type { Database } from './database';

function fakeDatabase(records: any[] = []) {
  return { records, database: { users: {
    find: ({ user }: any) => ({ toArray: async () => records.filter(record => user.$in.includes(record.user)) }),
    insertMany: async (docs: any[]) => { records.push(...docs); },
    updateMany: async (filter: any, update: any) => {
      for (const record of records) {
        if ((typeof filter.user === 'string' ? record.user === filter.user : filter.user.$in.includes(record.user)) && record.created === false) {
          Object.assign(record, update.$set);
          for (const key of Object.keys(update.$unset ?? {})) delete record[key];
        }
      }
    },
  } } as unknown as Database };
}
async function finished(...names: string[]) {
  for (let attempt = 0; attempt < 100 && names.some(isUserCreationPending); attempt++) await Bun.sleep(5);
  expect(names.some(isUserCreationPending)).toBe(false);
}

test('parses row and TXT input, preserving password punctuation and existing prefixes', () => {
  expect(parseNewUsers([{ name: 'Alice', password: 'secret' }], '\uFEFF# comment\r\nf25_bob: spaces:inside \r\n', 2026)).toEqual([
    { name: 'f26_alice', password: 'secret' }, { name: 'f25_bob', password: ' spaces:inside ' },
  ]);
  for (const [rows, text] of [
    [[], 'bad line'], [[], 'test:short'], [[], 'test:secret\nf26_test:secret'],
    [[{ name: 'test;id', password: 'secret' }], ''],
    [[{ name: 'test', password: 'secret\nother' }], ''],
  ] as const) expect(() => parseNewUsers([...rows], text, 2026)).toThrow();
});

test('creates all portal records first, queues host work, and only marks successful accounts created', async () => {
  const { records, database } = fakeDatabase();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const calls: string[] = [];
  const result = await createUsers(database, parseNewUsers([], 'first:secret\nsecond:secret', 2026), async login => {
    expect(records).toHaveLength(2);
    expect(records.every(record => !('password' in record))).toBe(true);
    calls.push(login);
    if (login === 'f26_first') { await gate; return 45001; }
    throw new Error('Host failed');
  });
  expect(result.ok).toBe(true);
  expect(records.every(record => record.created === false)).toBe(true);
  expect(calls).toEqual(['f26_first']);
  expect((await createUsers(database, [{ name: 'f26_first', password: 'secret' }])).ok).toBe(false);
  release();
  await finished('f26_first', 'f26_second');
  expect(records[0].created).toBe(true);
  expect(records[0].port).toBe(45001);
  expect(records[1].created).toBe(false);
  expect(records[1].creationError).toBe('Host failed');
  expect((await createUsers(database, [{ name: 'f26_first', password: 'secret' }])).ok).toBe(false);
  expect((await createUsers(database, [{ name: 'f26_second', password: 'secret' }], async () => 45002)).ok).toBe(true);
  await finished('f26_second');
  expect(records).toHaveLength(2);
  expect(records[1].created).toBe(true);
  expect(records[1].creationError).toBeUndefined();
});

const directory = mkdtempSync(join(tmpdir(), 'portal-create-test-'));
const original = { ...process.env };
afterAll(() => {
  for (const name of ['PATH', 'PASSWORD_RESET_SSH_TARGET', 'PASSWORD_RESET_SSH_KEY']) {
    if (original[name] === undefined) delete process.env[name]; else process.env[name] = original[name];
  }
  rmSync(directory, { recursive: true, force: true });
});

test('SSH sends password only over stdin and requires a successful result with a valid port', async () => {
  process.env.PATH = `${directory}:${original.PATH}`;
  process.env.PASSWORD_RESET_SSH_TARGET = 'test@host';
  process.env.PASSWORD_RESET_SSH_KEY = '/unused/key';
  writeFileSync(join(directory, 'ssh'), `#!/bin/bash
[[ "\${!#}" == 'create f26_test' ]] || exit 1
[[ "$*" != *'secret: with spaces'* ]] || exit 2
IFS= read -r password
[[ $password == 'secret: with spaces' ]] || exit 3
echo PORTAL_CREATED_PORT=45003
`, { mode: 0o755 });
  expect(await provisionUser('f26_test', 'secret: with spaces')).toBe(45003);
  writeFileSync(join(directory, 'ssh'), '#!/bin/bash\ncat >/dev/null\necho PORTAL_CREATED_PORT=0\n', { mode: 0o755 });
  await expect(provisionUser('f26_test', 'secret')).rejects.toThrow('valid Redis port');
  writeFileSync(join(directory, 'ssh'), '#!/bin/bash\ncat >/dev/null\nexit 1\n', { mode: 0o755 });
  await expect(provisionUser('f26_test', 'secret')).rejects.toThrow('Host provisioning failed');
});
