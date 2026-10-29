import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { mongoExecutor } from './executor';

const execution = new AsyncLocalStorage<{ id: string; used: boolean }>();

export function mongoExecutionId(): string {
  const context = execution.getStore();
  if (!context) throw new Error('MongoDB execution requires a grading scope');
  context.used = true;
  return context.id;
}

/** Keep reference, submission and Test in one private workspace; always remove it. */
export async function withExecutionScope<T>(run: () => Promise<T>): Promise<T> {
  if (execution.getStore()) return run();
  const context = { id: randomUUID(), used: false };
  return execution.run(context, async () => {
    try {
      return await run();
    } finally {
      if (context.used) {
        const cleaned = await mongoExecutor('/cleanup', { executionId: context.id });
        if (!cleaned.ok) console.error('MongoDB workspace cleanup failed:', cleaned.error);
      }
    }
  });
}
