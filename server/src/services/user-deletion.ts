import { $ } from 'bun';
import type { ServiceResponse } from './response';

const pending = new Set<string>();

export async function deleteUser({ login }: { login: string }): Promise<ServiceResponse<{ message: string }>> {
  if (!/^f[0-9]{2}_[a-z0-9_]{1,43}$/.test(login)) {
    return { ok: false, data: null, error: `'${login}' is not a student account` };
  }
  const target = process.env.PASSWORD_RESET_SSH_TARGET;
  const key = process.env.PASSWORD_RESET_SSH_KEY;
  if (!target || !key) {
    return { ok: false, data: null, error: 'Account deletion requires PASSWORD_RESET_SSH_TARGET / PASSWORD_RESET_SSH_KEY and the host deletion helper' };
  }
  if (pending.has(login)) return { ok: false, data: null, error: 'This account is already being deleted' };
  pending.add(login);
  try {
    // The forced command accepts only a validated action and one exact student login.
    const command = `delete ${login}`;
    const result = await $`ssh -i ${key} -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/tmp/portal_known_hosts ${target} ${command}`.quiet().nothrow();
    if (result.exitCode !== 0) {
      console.error(`Account deletion failed for ${login} (exit ${result.exitCode}): ${result.stderr.toString().trim()}`);
      return { ok: false, data: null, error: 'Account deletion failed. Some resources may already have been removed; check the host configuration and logs before retrying.' };
    }
    return { ok: true, error: null, data: { message: `Account ${login} deleted.` } };
  } catch {
    return { ok: false, data: null, error: 'Could not execute account deletion' };
  } finally {
    pending.delete(login);
  }
}
