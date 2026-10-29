import type { ServiceResponse } from '../response';

export async function mongoExecutor<T>(path: '/mongo' | '/cleanup', body: object): Promise<ServiceResponse<T>> {
  const socket = process.env.MONGO_EXECUTOR_SOCKET;
  if (!socket) return { ok: false, data: null, error: 'MongoDB executor is not configured' };
  try {
    const options: RequestInit & { unix: string } = {
      unix: socket,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    };
    const response = await fetch(`http://localhost${path}`, options);
    return (await response.json()) as ServiceResponse<T>;
  } catch {
    return { ok: false, data: null, error: 'MongoDB executor unavailable; please retry' };
  }
}
