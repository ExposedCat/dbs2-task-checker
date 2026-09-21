import type { ServiceResponse } from './response';

export async function parseJsonFile<T>(file: File): Promise<ServiceResponse<T>> {
  try {
    const raw = await file.text();
    const data = await JSON.parse(raw);
    return {
      ok: true,
      error: null,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      error: (error as any).message ?? 'unknown',
      data: null,
    };
  }
}
