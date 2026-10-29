import { withExecutionScope } from './context';

// Limits apply per API process. Container limits are an additional backstop.
export const MAX_QUERIES = 100;
export const MAX_QUERY_LENGTH = 16_384;
export const MAX_QUERY_BYTES = 64 * 1024;
export const MAX_OUTPUT_BYTES = 1024 * 1024;
export const EXECUTION_TIMEOUT_MS = 15_000;
export const MAX_PENDING_SUBMISSIONS = 16;
export const MAX_QUEUE_WAIT_MS = 120_000;

type Waiting = { start: () => void; timer: ReturnType<typeof setTimeout> };

/** One complete grading operation owns the executor; never interleave reset/load/test. */
export class SubmissionQueue {
  private running = false;
  private waiting: Waiting[] = [];
  constructor(
    private maxPending = MAX_PENDING_SUBMISSIONS,
    private waitMs = MAX_QUEUE_WAIT_MS,
  ) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.running) {
      if (this.waiting.length >= this.maxPending) throw new Error('Grading queue is full; try again shortly');
      await new Promise<void>((resolve, reject) => {
        const entry: Waiting = {
          start: resolve,
          timer: setTimeout(() => {
            this.waiting = this.waiting.filter(item => item !== entry);
            reject(new Error('Timed out waiting for grading; try again shortly'));
          }, this.waitMs),
        };
        this.waiting.push(entry);
      });
    } else {
      this.running = true;
    }
    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      if (next) {
        clearTimeout(next.timer);
        next.start();
      } else {
        this.running = false;
      }
    }
  }
}

const submissions = new SubmissionQueue();
const mongoSubmissions = new Map<string, SubmissionQueue>();

/** Redis owns the shared reset slot; MongoDB scopes can execute independently. */
export const withSubmissionSlot = async <T>(run: () => Promise<T>, mongoScope?: string): Promise<T> => {
  if (!mongoScope) return submissions.run(() => withExecutionScope(run));
  let entry = mongoSubmissions.get(mongoScope);
  if (!entry) {
    entry = new SubmissionQueue();
    mongoSubmissions.set(mongoScope, entry);
  }
  // Keep the keyed queue while any active or waiting caller still uses it.
  const queue = entry;
  mongoQueueUsers.set(queue, (mongoQueueUsers.get(queue) ?? 0) + 1);
  try {
    return await queue.run(() => withExecutionScope(run));
  } finally {
    const remaining = mongoQueueUsers.get(queue)! - 1;
    if (remaining) mongoQueueUsers.set(queue, remaining);
    else {
      mongoQueueUsers.delete(queue);
      mongoSubmissions.delete(mongoScope);
    }
  }
};
const mongoQueueUsers = new Map<SubmissionQueue, number>();
