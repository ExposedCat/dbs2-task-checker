import { $ } from 'bun';

import type { ServiceResponse } from './response';

// The API runs in a container while the students' Linux accounts live on the host, so the reset
// is delegated over SSH to a forced command on the host (scripts/host/README.md). That command
// expires the account's password (`passwd -e`): the student must choose a new one at the next
// login. Portal and database passwords are not touched.
const SSH_TARGET = process.env.PASSWORD_RESET_SSH_TARGET; // e.g. yuliia@host.containers.internal
const SSH_KEY = process.env.PASSWORD_RESET_SSH_KEY; // private key of the portal, see compose.yaml

/** Student logins as produced by the provisioning scripts (fYY_name); also enforced on the host */
const STUDENT_LOGIN = /^f[0-9]{2}_[a-z0-9_]{1,43}$/;

export type ExpirePasswordArgs = {
  login: string;
};

export async function expirePassword({ login }: ExpirePasswordArgs): Promise<ServiceResponse<{ message: string }>> {
  if (!STUDENT_LOGIN.test(login)) {
    return { ok: false, error: `'${login}' is not a student account`, data: null };
  }
  if (!SSH_TARGET || !SSH_KEY) {
    return {
      ok: false,
      error: 'Password reset is not configured on this server (PASSWORD_RESET_SSH_TARGET / PASSWORD_RESET_SSH_KEY)',
      data: null,
    };
  }

  // The login is the whole SSH command; the forced command on the host reads it from
  // SSH_ORIGINAL_COMMAND. Host keys are trusted on first use: the target is the machine the
  // container runs on.
  const result = await $`ssh -i ${SSH_KEY} -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/tmp/portal_known_hosts ${SSH_TARGET} ${login}`
    .quiet()
    .nothrow();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`.trim();
  if (result.exitCode !== 0) {
    console.error(`Password reset of '${login}' failed (exit ${result.exitCode}): ${output}`);
    return { ok: false, error: output || `Password reset failed (exit code ${result.exitCode})`, data: null };
  }

  return { ok: true, error: null, data: { message: output || `Password of ${login} expired` } };
}
