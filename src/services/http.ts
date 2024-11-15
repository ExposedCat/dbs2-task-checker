export const BASE_API_URL = import.meta.env.VITE_BASE_API_URL;

export type HttpRequestArgs = {
  path: string;
  contentType: 'json' | 'form';
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
      error: string;
      data: null;
    };

function makeFormData(data: Record<string, any> | null | undefined) {
  const formData = new FormData();
  if (data) {
    for (const [key, value] of Object.entries(data)) {
      formData.set(key, value);
    }
  }
  return formData;
}

export async function httpRequest<D>(args: HttpRequestArgs): Promise<HttpResponse<D>> {
  const { path, authorization, method, contentType, ...rest } = args;

  try {
    const response = await fetch(`${BASE_API_URL}${path}`, {
      method,
      headers: {
        ...(contentType === 'json' && { 'Content-Type': 'application/json' }),
        ...(authorization && { 'Authorization': authorization }),
      },
      ...(method === 'POST' && {
        body: contentType === 'json' ? JSON.stringify(rest.body) : makeFormData(rest.body),
      }),
    });
    const data = (await response.json()) as HttpResponse<D>;

    if (!response.ok) {
      return { ok: false, error: 'Unknown Error', data: null };
    }
    return data;
  } catch (error) {
    return {
      ok: false,
      error: (error as Error).message ?? (error as string),
      data: null,
    };
  }
}
