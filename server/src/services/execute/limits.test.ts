import { expect, test } from 'bun:test';
import { SubmissionQueue } from './limits';
import { runProcess } from './process';

test('kills an executor that exceeds its deadline', async () => {
  const result = await runProcess([process.execPath, '-e', 'setInterval(() => {}, 1000)'], 100);
  expect(result).toEqual({
    ok: false,
    output: 'Execution time limit exceeded',
  });
});

test('kills an executor producing excessive output', async () => {
  const result = await runProcess([process.execPath, '-e', 'console.log("x".repeat(10000))'], 5000, 100);
  expect(result).toEqual({
    ok: false,
    output: 'Execution output limit exceeded',
  });
});

test('captures output and handles missing executables', async () => {
  expect(await runProcess([process.execPath, '-e', 'console.log("ok")'], 5000)).toEqual({ ok: true, output: 'ok\n' });
  expect((await runProcess(['/does-not-exist'], 5000)).ok).toBe(false);
});

test('runs complete jobs in FIFO order, bounds waiting jobs, and releases after failure', async () => {
  const queue = new SubmissionQueue(1, 1000);
  const events: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const first = queue.run(async () => {
    events.push('first-start');
    await gate;
    events.push('first-end');
    throw new Error('failed');
  });
  const rejected = first.catch(error => error as Error);
  const second = queue.run(async () => {
    events.push('second');
    return 'done';
  });
  await expect(queue.run(async () => {})).rejects.toThrow('full');
  expect(events).toEqual(['first-start']);
  release();
  expect((await rejected).message).toBe('failed');
  expect(await second).toBe('done');
  expect(events).toEqual(['first-start', 'first-end', 'second']);
  expect(await queue.run(async () => 'released')).toBe('released');
});

test('expired queued work is removed and never runs', async () => {
  const queue = new SubmissionQueue(2, 10);
  let release!: () => void;
  const first = queue.run(
    () =>
      new Promise<void>(resolve => {
        release = resolve;
      }),
  );
  let ran = false;
  await expect(
    queue.run(async () => {
      ran = true;
    }),
  ).rejects.toThrow('Timed out');
  release();
  await first;
  expect(ran).toBe(false);
  expect(await queue.run(async () => 'next')).toBe('next');
});
