import React from 'react';

import { setSessionToken } from '~/services/session.js';
import { usePostRequest } from '~/hooks/usePostRequest.js';
import { Page } from '~/components/elements/Page.js';
import { Label } from '~/components/elements/Label.js';
import { Input } from '~/components/elements/Input.js';
import { Button } from '~/components/elements/Button.js';

export function LoginPage() {
  const [login, setLogin] = React.useState('');
  const [password, setPassword] = React.useState('');

  const query = usePostRequest<{ data: string }>('/login', ({ data }) => setSessionToken(data));

  return (
    <Page>
      <Input placeholder="Login" type="text" onValueChange={setLogin} />
      <Input placeholder="Password" type="password" autoComplete="current-password" onValueChange={setPassword} />
      {!!query.error && <Label text="Incorrect login and/or password" color="error" />}
      <Button label="Log In" onClick={() => query.request({ login, password })} />
    </Page>
  );
}
