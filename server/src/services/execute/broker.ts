import type { ServiceResponse } from '../response';

export async function gradingBroker<T>(path: '/mongo' | '/redis-restart', body: object): Promise<ServiceResponse<T>> {
  const socket = process.env.GRADING_BROKER_SOCKET;
  if (!socket) return { ok: false, data: null, error: 'Private grading broker is not configured' };
  try {
    const response = await fetch(`http://localhost${path}`, {
      unix: socket,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Broker enforces the execution deadline and completes recovery before replying.
      signal: AbortSignal.timeout(90_000),
    });
    return (await response.json()) as ServiceResponse<T>;
  } catch {
    return { ok: false, data: null, error: 'Grading broker unavailable; please retry' };
  }
}
