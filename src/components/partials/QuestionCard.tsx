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
import { ErrorCard } from './ErrorCard.js';
import { DownlloadDatasetButton } from './DownloadDatasetButton.js';

const EmptyBody: React.FC = () => {
  const { session, refetch: refetchSession } = useSession();
  const { currentDataset } = useNavigation();
  const datasets = useDatasets();

  const datasetName = React.useMemo(
    () => datasets.find(dataset => dataset.id === currentDataset)?.name,
    [currentDataset, datasets],
  );

  const startSessionQuery = usePostRequest('/test-session', () => refetchSession());

  const canStart = React.useMemo(
    () => session.availableTests.includes(currentDataset!),
    [currentDataset, session.availableTests],
  );

  return (
    <Card maxWidth="container.full" gap="md">
      <Label text="During this test, you will be given a random set of tasks selected from various categories. Each task will require you to interact with a dataset, which will be loaded into your database before each submission. The dataset will remain the same throughout the test, so you can rely on its consistency as you work through the tasks" />
      <Label text="Your goal is to write queries that correctly solve each task based on the provided dataset. All your query submissions will be saved automatically and sent to your teacher for evaluation." />
      <Button
        disabled={!canStart}
        label={canStart ? `Start ${datasetName} Test` : 'Test already passed'}
        onClick={() => startSessionQuery.request({ datasetId: currentDataset })}
      />
      {startSessionQuery.state === 'error' && <ErrorCard error={startSessionQuery.error} />}
    </Card>
  );
};

type ResultCallback = (args: { correct: number; total: number; wrong: string[] } | null) => void;

const QuestionBody: React.FC<{ onResult: ResultCallback }> = ({ onResult }) => {
  const {
    session: { testSession },
    refetch: refetchSession,
  } = useSession();

  const [solution, setSolution] = React.useState('');

  const query = usePostRequest<{ wrong: string[]; result: number | null }>('/query', response => {
    console.log(response);
    if (response.result !== null) {
      onResult({
        correct: response.result,
        total: testSession!.questionTotal,
        wrong: response.wrong,
      });
      refetchSession();
    }
  });

  const handleExecute = React.useCallback(() => query.request({ query: solution }), [query, solution]);

  React.useEffect(() => {
    if (query.state === 'success') {
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
      {query.state === 'error' && <ErrorCard error={query.error} />}
    </>
  );
};

const ResultBody: React.FC<{ correct: number; total: number; wrong: string[]; onResult: ResultCallback }> = ({
  correct,
  total,
  onResult,
  wrong,
}) => {
  return (
    <>
      <Label text={`Correct: ${correct}/${total}`} />
      {wrong.length === 0 && <Label text="You got it all right, congratulations!" />}
      {wrong.length !== 0 && (
        <Flex align="start" direction="column" paddingX="lg">
          <Label text="You got these wrong:" />
          {wrong.map((question, i) => (
            <Label key={i} text={`- ${question}`} color="warning" />
          ))}
        </Flex>
      )}
      <Button label="Continue" onClick={() => onResult(null)} />
    </>
  );
};

export const QuestionCard: React.FC = () => {
  const {
    session: { testSession },
  } = useSession();

  const [result, setResult] = React.useState<{ correct: number; total: number; wrong: string[] } | null>(null);

  if (result !== null) {
    return <ResultBody {...result} onResult={setResult} />;
  }

  return testSession ? <QuestionBody onResult={setResult} /> : <EmptyBody />;
};
