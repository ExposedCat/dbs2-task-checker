const BASE_URL = 'http://127.0.0.1:8080';

export type HttpRequestArgs = {
  path: string;
  authorization: string | null;
} & (
  | {
      method: 'GET';
      body?: null | undefined;
    }
  | {
      method: 'POST';
      body: Record<string, any>;
    }
);

export type HttpResponse<D> =
  | {
      ok: true;
      error: null;
      data: D;
    }
  | {
      ok: false;
      error: unknown;
      data: null;
    };

export async function httpRequest<D>(args: HttpRequestArgs): Promise<HttpResponse<D>> {
  const { path, authorization, method, ...rest } = args;

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authorization && { 'Authorization': authorization }),
      },
      ...(method === 'POST' && {
        body: JSON.stringify(rest.body),
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      return { ok: false, error: data, data: null };
    }
    return { ok: true, data, error: null };
  } catch (error) {
    return { ok: false, error, data: null };
  }
}
