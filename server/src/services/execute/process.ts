import { spawn } from 'node:child_process';
import { MAX_OUTPUT_BYTES } from './limits';

/** Bounded process execution on Linux. This is resource control, NOT a security sandbox. */
export function runProcess(
  command: string[],
  timeoutMs: number,
  maxOutputBytes = MAX_OUTPUT_BYTES,
): Promise<{
  ok: boolean;
  output: string;
}> {
  return new Promise(resolve => {
    if (timeoutMs <= 0) {
      resolve({ ok: false, output: 'Execution time limit exceeded' });
      return;
    }
    const child = spawn(command[0], command.slice(1), {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Uint8Array[] = [];
    const stderr: Uint8Array[] = [];
    let bytes = 0;
    let failure: string | undefined;
    const kill = () => {
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* Already exited. */
        }
      }
    };
    const timer = setTimeout(() => {
      failure = 'Execution time limit exceeded';
      kill();
    }, timeoutMs);
    const collect = (target: Uint8Array[]) => (chunk: Buffer) => {
      if (failure) return;
      bytes += chunk.length;
      if (bytes > maxOutputBytes) {
        failure = 'Execution output limit exceeded';
        kill();
      } else {
        target.push(new Uint8Array(chunk));
      }
    };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.on('error', () => {
      failure = 'Unable to start query executor';
    });
    child.on('close', code => {
      clearTimeout(timer);
      kill(); // Clean up descendants remaining in this process group.
      resolve({
        ok: !failure && code === 0,
        output: failure ?? Buffer.concat(code === 0 ? stdout : stderr).toString('utf8'),
      });
    });
  });
}
