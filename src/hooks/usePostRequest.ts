import React from 'react';

import * as httpJs from '~/services/http.js';
import type { UseGetRequestResult } from './useGetRequest.js';
import { useSessionToken } from './useSessionToken.js';

export type UsePostRequestResult<D> = {
  request: (body: Record<string, any> | FormData) => void;
} & (
  | {
      state: 'idle';
      data: null;
      error: null;
    }
  | UseGetRequestResult<D>
);

type UsePostRequestOptions<D> = {
  contentType?: httpJs.HttpRequestArgs['contentType'];
  onSuccess?: (data: D) => void;
};

export function usePostRequest<D>(
  path: string,
  { contentType = 'json', onSuccess }: UsePostRequestOptions<D> = {},
): UsePostRequestResult<D> {
  const token = useSessionToken();

  const [state, setState] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [data, setData] = React.useState<D | null>(null);
  const [error, setError] = React.useState<unknown | null>(null);

  const request = React.useCallback(
    (body: Record<string, any>) =>
      httpJs
        .httpRequest<D>({
          method: 'POST',
          path,
          authorization: token,
          contentType,
          body,
          // eslint-disable-next-line github/no-then
        })
        .then(response => {
          setState(response.ok ? 'success' : 'error');
          if (response.ok) {
            setData(response.data);
            onSuccess?.(response.data);
          } else {
            setError(response.error);
          }
        }),
    [onSuccess, path, token, contentType],
  );

  return { state, data, error, request } as UsePostRequestResult<D>;
}
