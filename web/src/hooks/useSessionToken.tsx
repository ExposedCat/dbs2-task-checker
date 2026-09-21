import React from 'react';

import { getSessionToken } from '~/services/session.js';

export function useSessionToken() {
  const [token, setToken] = React.useState(getSessionToken());

  React.useEffect(() => {
    const listener = () => setToken(getSessionToken());
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }, []);

  return token;
}
