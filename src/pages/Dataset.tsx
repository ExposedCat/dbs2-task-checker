import React from 'react';

import { useSession } from '~/providers/SessionProvider.js';
import { QuestionCard } from '~/components/partials/QuestionCard.js';
import { Page } from '~/components/elements/Page.js';

export function DatasetPage() {
  const { session } = useSession();

  // const query = usePostRequest<{ token: string }>('/login', ({ token }) => setSessionToken(token));

  return (
    <Page>
      {!session.testSession && 'No session'}
      {session.testSession && <QuestionCard />}
    </Page>
  );
}
