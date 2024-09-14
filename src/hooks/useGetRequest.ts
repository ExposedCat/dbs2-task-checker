import React from 'react';

import { httpRequest } from '~/services/http.js';
import { useSessionToken } from './useSessionToken.js';

export type UseGetRequestResult<D> =
  | {
      state: 'loading';
      data: null;
      error: null;
    }
  | {
      state: 'success';
      data: D;
      error: null;
    }
  | {
      state: 'error';
      data: null;
      error: unknown;
    };

export function useGetRequest<D>(path: string): UseGetRequestResult<D> {
  const [state, setState] = React.useState<'loading' | 'success' | 'error'>('loading');
  const [data, setData] = React.useState<D | null>(null);
  const [error, setError] = React.useState<unknown | null>(null);
  const token = useSessionToken();

  React.useEffect(() => {
    void httpRequest<D>({
      method: 'GET',
      path,
      authorization: token,
      // eslint-disable-next-line github/no-then
    }).then(response => {
      setState(response.ok ? 'success' : 'error');
      if (response.ok) {
        setData(response.data);
      } else {
        setError(response.error);
      }
    });
  }, [path, token]);

  return { state, data, error } as UseGetRequestResult<D>;
}
