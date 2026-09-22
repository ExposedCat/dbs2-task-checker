import { $ } from 'bun';
import type { Database } from './database';
import type { ServiceResponse } from './response';

export type NewUser = { name: string; password: string };
const active = new Set<string>();
let queue = Promise.resolve();
export const isUserCreationPending = (login: string) => active.has(login);

export function parseNewUsers(rows: NewUser[], fileText = '', year = new Date().getFullYear()): NewUser[] {
  const entries = [...rows];
  for (const [index, line] of fileText.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    if (!line.trim() || line.startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator < 0) throw new Error(`TXT line ${index + 1}: expected name:password`);
    entries.push({ name: line.slice(0, separator), password: line.slice(separator + 1) });
  }
  if (!entries.length || entries.length > 500) throw new Error('Enter between 1 and 500 users');
  const seen = new Set<string>();
  return entries.map(({ name, password }) => {
    const normalized = name.trim().toLowerCase();
    const login = /^f\d{2}_/.test(normalized) ? normalized : `f${String(year).slice(-2)}_${normalized}`;
    if (!/^f[0-9]{2}_[a-z0-9_]{1,43}$/.test(login)) throw new Error(`Invalid student name: ${name}`);
    if (password.length < 6 || password.length > 4096 || /[\r\n\0]/.test(password)) {
      throw new Error(`Password for ${login} must have 6–4096 characters and no line breaks`);
    }
    if (seen.has(login)) throw new Error(`Duplicate name: ${login}`);
    seen.add(login);
    return { name: login, password };
  });
}

export async function provisionUser(login: string, password: string): Promise<number> {
  const target = process.env.PASSWORD_RESET_SSH_TARGET;
  const key = process.env.PASSWORD_RESET_SSH_KEY;
  if (!target || !key) throw new Error('Account creation SSH is not configured');
  const command = `create ${login}`;
  // Passwords travel only on stdin, never in arguments, logs, or database records.
  const input = Buffer.from(`${password}\n`);
  let result;
  try {
    result = await $`ssh -i ${key} -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/tmp/portal_known_hosts ${target} ${command} < ${input}`.quiet().nothrow();
  } catch {
    throw new Error('Could not start host provisioning; check the SSH configuration');
  } finally {
    input.fill(0);
  }
  if (result.exitCode !== 0) throw new Error(`Host provisioning failed (exit ${result.exitCode}). Check the creation helper and retry this login with the same password.`);
  const match = result.stdout.toString().match(/^PORTAL_CREATED_PORT=(\d+)$/m);
  const port = Number(match?.[1]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Host did not return a valid Redis port; retry with the same password');
  return port;
}

export async function createUsers(
  database: Database,
  entries: NewUser[],
  provision = provisionUser,
): Promise<ServiceResponse<{ users: string[] }>> {
  const names = entries.map(entry => entry.name);
  if (names.some(name => active.has(name))) return { ok: false, data: null, error: 'An account in this batch is already being created' };
  names.forEach(name => active.add(name));
  try {
    const existing = await database.users.find({ user: { $in: names } }).toArray();
    const complete = existing.find(user => user.created !== false);
    if (complete) throw new Error(`Account ${complete.user} already exists`);
    const existingNames = new Set(existing.map(user => user.user));
    const fresh = names.filter(name => !existingNames.has(name));
    if (fresh.length) await database.users.insertMany(fresh.map(user => ({
      user, created: false, port: 0, admin: false, submissions: [], testSession: null,
    })));
    if (existing.length) await database.users.updateMany({ user: { $in: names }, created: false }, { $unset: { creationError: '' } });
    // Every portal record exists before the first host operation starts.
    for (const entry of entries) {
      queue = queue.then(async () => {
        try {
          const port = await provision(entry.name, entry.password);
          await database.users.updateMany({ user: entry.name, created: false }, {
            $set: { created: true, port }, $unset: { creationError: '' },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Account creation failed';
          await database.users.updateMany({ user: entry.name, created: false }, { $set: { creationError: message } });
        } finally {
          entry.password = '';
          active.delete(entry.name);
        }
      }).catch(() => {
        // A database outage must not stop other queued accounts or expose credentials.
        console.error(`Could not save creation status for ${entry.name}`);
      });
    }
    return { ok: true, error: null, data: { users: names } };
  } catch (error) {
    names.forEach(name => active.delete(name));
    return { ok: false, data: null, error: error instanceof Error ? error.message : 'Could not create portal records' };
  }
}
