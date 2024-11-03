import React from 'react';

import { setSessionToken } from '~/services/session.js';
import { usePostRequest } from '~/hooks/usePostRequest.js';
import { Page } from '~/components/elements/Page.js';
import { Label } from '~/components/elements/Label.js';
import { Button } from '~/components/elements/Button.js';
import { Input } from '~/components/elements/Input';

export function LoginPage() {
  const [login, setLogin] = React.useState('');
  const [password, setPassword] = React.useState('');

  const query = usePostRequest<string>('/login', { onSuccess: setSessionToken });

  return (
    <Page>
      <Label text="Welcome to the DBS2 Portal" kind="header" />
      <Label text="Use your initial password from EMail to log in" />
      <Input placeholder="Login (f24_example)" type="text" onValueChange={setLogin} />
      <Input placeholder="Initial Password (E7am8pL3)" type="password" autoComplete="current-password" onValueChange={setPassword} />
      {!!query.error && <Label text="Incorrect login and/or password" color="error" />}
      <Button label="Log In" onClick={() => query.request({ login, password })} />
    </Page>
  );
}
