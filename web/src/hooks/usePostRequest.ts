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

  const [state, setState] = React.useState({
    state: 'idle' as 'idle' | 'loading' | 'success' | 'error',
    data: null as null | D,
    error: null as null | unknown,
  });

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
          setState({
            state: response.ok ? 'success' : 'error',
            data: response.ok ? response.data : null,
            error: response.ok ? null : response.error,
          });
          if (response.ok) {
            onSuccess?.(response.data);
          } else {
            throw response.error;
          }
        })
        .catch(error => {
          console.error(`POST Request failed: `, error);
          setState({ state: 'error', data: null, error });
        }),
    [onSuccess, path, token, contentType],
  );

  return { ...state, request } as UsePostRequestResult<D>;
}
