import { afterAll, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deleteUser } from './user-deletion';

const original = { ...process.env };
const directory = mkdtempSync(join(tmpdir(), 'portal-delete-test-'));
afterAll(() => {
  process.env.PATH = original.PATH;
  for (const name of ['PASSWORD_RESET_SSH_TARGET', 'PASSWORD_RESET_SSH_KEY']) {
    if (original[name] === undefined) delete process.env[name];
    else process.env[name] = original[name];
  }
  rmSync(directory, { recursive: true, force: true });
});

test('rejects non-student names and command injection before execution', async () => {
  for (const login of ['root', 'f26_test;id', 'f26_test\nf26_other', '-f26_test', 'f26_']) {
    expect((await deleteUser({ login })).ok).toBe(false);
  }
});

test('requires SSH configuration', async () => {
  delete process.env.PASSWORD_RESET_SSH_TARGET;
  expect((await deleteUser({ login: 'f25_student' })).ok).toBe(false);
});

test('sends the exact full login and reports process failures', async () => {
  process.env.PASSWORD_RESET_SSH_TARGET = 'test@host';
  process.env.PASSWORD_RESET_SSH_KEY = '/unused/test-key';
  process.env.PATH = `${directory}:${original.PATH}`;
  writeFileSync(join(directory, 'ssh'), '#!/bin/bash\n[[ "${!#}" == "delete f25_student" ]]\n', { mode: 0o755 });
  expect((await deleteUser({ login: 'f25_student' })).ok).toBe(true);
  writeFileSync(join(directory, 'ssh'), '#!/bin/bash\nexit 1\n', { mode: 0o755 });
  expect((await deleteUser({ login: 'f25_student' })).ok).toBe(false);
});
