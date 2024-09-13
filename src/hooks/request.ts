import React from 'react';

import { httpRequest } from '~/services/http.js';

export type UseRequestResult<D> =
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

export function useRequest<D>(path: string): UseRequestResult<D> {
  const [state, setState] = React.useState<'loading' | 'success' | 'error'>('loading');
  const [data, setData] = React.useState<D | null>(null);
  const [error, setError] = React.useState<unknown | null>(null);

  React.useEffect(() => {
    void httpRequest<D>({
      method: 'GET',
      path,
      authorization: '',
      // eslint-disable-next-line github/no-then
    }).then(response => {
      setState(response.ok ? 'success' : 'error');
      if (response.ok) {
        setData(response.data);
      } else {
        setError(response.error);
      }
    });
  }, [path]);

  return { state, data, error } as UseRequestResult<D>;
}
