import React from 'react';
import { Flex } from '@styled-system/jsx/flex.mjs';

import { useSession } from '~/providers/SessionProvider.js';
import { usePostRequest } from '~/hooks/usePostRequest.js';
import { TextArea } from '../elements/TextArea.js';
import { Label } from '../elements/Label.js';
import { Card } from '../elements/Card.js';
import { Button } from '../elements/Button.js';
import { Badge } from '../elements/Badge.js';
import { DownlloadDatasetButton } from './DownloadDatasetButton.js';

export const QuestionCard: React.FC = () => {
  const { testSession } = useSession();
  const [solution, setSolution] = React.useState('');

  const query = usePostRequest<{ ok: boolean; response: string }>('/query');

  const handleExecute = React.useCallback(() => query.request({ query: solution }), [query, solution]);

  if (!testSession) {
    return null;
  }

  return (
    <>
      <Card gap="sm" maxWidth="container.full">
        <Flex align="center" justify="space-between" gap="sm">
          <Badge text={`${testSession.questionNumber} / ${testSession.questionTotal}`} />
          <Badge text={testSession.kind} />
          <Label text={testSession.question} />
        </Flex>
        <TextArea placeholder="Write a query..." onChange={setSolution} />
        <Flex width="full" justify="space-between" align="center">
          <DownlloadDatasetButton />
          <Button label="Execute" disabled={query.state === 'loading'} onClick={handleExecute} />
        </Flex>
      </Card>
      {query.state === 'success' && (
        <Card maxWidth="container.full">
          <Label text={query.data.response} color={query.data.ok ? 'normal' : 'error'} />
        </Card>
      )}
      {query.state === 'error' && (
        <Card maxWidth="container.full">
          <Label text={query.error as string} color="error" />
        </Card>
      )}
    </>
  );
};
