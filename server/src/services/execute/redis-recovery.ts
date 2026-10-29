import { createClient } from 'redis';

/** Redis exits on SHUTDOWN; Compose's restart policy brings the service back. */
export async function recoverRedis(): Promise<void> {
  if (!process.env.REDIS_GRADING_URL || !process.env.REDIS_GRADING_PASSWORD)
    throw new Error('Redis recovery is not configured');
  const adminUrl = new URL(process.env.REDIS_GRADING_URL);
  adminUrl.username = 'admin';
  adminUrl.password = process.env.REDIS_GRADING_PASSWORD;
  const admin = createClient({
    url: adminUrl.toString(),
    socket: { reconnectStrategy: false, connectTimeout: 2000 },
  });
  admin.on('error', () => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await admin.connect();
    // SHUTDOWN NOSAVE also works when an unkillable write script is running.
    await Promise.race([
      admin.sendCommand(['SHUTDOWN', 'NOSAVE']).catch(() => undefined),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Redis recovery timed out')), 5000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (admin.isOpen) await admin.disconnect().catch(() => undefined);
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    const client = createClient({
      url: process.env.REDIS_GRADING_URL,
      socket: { reconnectStrategy: false, connectTimeout: 500 },
    });
    client.on('error', () => undefined);
    try {
      await client.connect();
      if ((await client.ping()) === 'PONG') return;
    } catch {
      // Compose is restarting Redis.
    } finally {
      if (client.isOpen) await client.disconnect().catch(() => undefined);
    }
    await Bun.sleep(250);
  }
  throw new Error('Redis did not recover');
}
