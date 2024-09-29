import React from 'react';
import { Flex } from '@styled-system/jsx/flex.mjs';

import { useSession } from '~/providers/SessionProvider.js';
import { useNavigation } from '~/providers/NavigationProvider.js';
import { useDatasets } from '~/providers/DatasetsProvider.js';
import { usePostRequest } from '~/hooks/usePostRequest.js';
import { TextArea } from '../elements/TextArea.js';
import { Label } from '../elements/Label.js';
import { Card } from '../elements/Card.js';
import { Button } from '../elements/Button.js';
import { Badge } from '../elements/Badge.js';
import { DownlloadDatasetButton } from './DownloadDatasetButton.js';

const EmptyBody: React.FC = () => {
  const { refetch: refetchSession } = useSession();
  const { currentDataset } = useNavigation();
  const datasets = useDatasets();

  const datasetName = React.useMemo(
    () => datasets.find(dataset => dataset.id === currentDataset)?.name,
    [currentDataset, datasets],
  );

  const startSessionQuery = usePostRequest<{ ok: boolean }>('/test-session', ({ ok }) => ok && refetchSession());

  return (
    <Card maxWidth="container.full" gap="md">
      <Label text="During this test, you will be given a random set of tasks selected from various categories. Each task will require you to interact with a dataset, which will be loaded into your database before each submission. The dataset will remain the same throughout the test, so you can rely on its consistency as you work through the tasks" />
      <Label text="Your goal is to write queries that correctly solve each task based on the provided dataset. All your query submissions will be saved automatically and sent to your teacher for evaluation." />
      <Button
        label={`Start ${datasetName} Test`}
        onClick={() => startSessionQuery.request({ datasetId: currentDataset })}
      />
    </Card>
  );
};

const QuestionBody: React.FC = () => {
  const {
    session: { testSession },
    refetch: refetchSession,
  } = useSession();

  const [solution, setSolution] = React.useState('');
  const query = usePostRequest<{ ok: boolean; response: string }>('/query');

  const handleExecute = React.useCallback(() => query.request({ query: solution }), [query, solution]);

  React.useEffect(() => {
    if (query.state === 'success' && query.data.ok) {
      refetchSession();
    }
  }, [query.data, query.state, refetchSession]);

  if (!testSession) return null;

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
      {query.state === 'success' && !query.data.ok && (
        <Card maxWidth="container.full">
          <Label text={query.data.response} color="error" />
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

export const QuestionCard: React.FC = () => {
  const {
    session: { testSession },
  } = useSession();

  return testSession ? <QuestionBody /> : <EmptyBody />;
};
