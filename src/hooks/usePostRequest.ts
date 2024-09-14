import React from 'react';

import { httpRequest } from '~/services/http.js';
import { useSessionToken } from './useSessionToken.js';
import type { UseGetRequestResult } from './useGetRequest.js';

export type UsePostRequestResult<D> = {
  request: (body: Record<string, any>) => void;
} & (
  | {
      state: 'idle';
      data: null;
      error: null;
    }
  | UseGetRequestResult<D>
);

export function usePostRequest<D>(path: string, onSuccess?: (data: D) => void): UsePostRequestResult<D> {
  const token = useSessionToken();

  const [state, setState] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [data, setData] = React.useState<D | null>(null);
  const [error, setError] = React.useState<unknown | null>(null);

  const request = React.useCallback(
    (body: Record<string, any>) =>
      httpRequest<D>({
        method: 'POST',
        path,
        authorization: token,
        body,
        // eslint-disable-next-line github/no-then
      }).then(response => {
        setState(response.ok ? 'success' : 'error');
        if (response.ok) {
          setData(response.data);
          onSuccess?.(response.data);
        } else {
          setError(response.error);
        }
      }),
    [onSuccess, path, token],
  );

  return { state, data, error, request } as UsePostRequestResult<D>;
}
