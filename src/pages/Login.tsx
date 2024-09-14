import React from 'react';

import { setSessionToken } from '~/services/session.js';
import { usePostRequest } from '~/hooks/usePostRequest.js';
import { Input } from '~/components/elements/Input.js';
import { Flex } from '~/components/elements/Flex.js';
import { Button } from '~/components/elements/Button.js';

export function LoginPage() {
  const [login, setLogin] = React.useState('');
  const [password, setPassword] = React.useState('');

  const query = usePostRequest<{ token: string }>('/login', ({ token }) => setSessionToken(token));

  return (
    <Flex direction="column" justify="center" align="center" gap="sm" full>
      <Input placeholder="Login" type="text" onValueChange={setLogin} />
      <Input placeholder="Password" type="password" autoComplete="current-password" onValueChange={setPassword} />
      <Button label="Log In" onClick={() => query.request({ login, password })} />
    </Flex>
  );
}
