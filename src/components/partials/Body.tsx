import React from 'react';

import { ProvideSession } from '~/providers/SessionProvider.js';
import type { Session } from '~/providers/SessionProvider.js';
import { useNavigation } from '~/providers/NavigationProvider.js';
import { ProvideDatasets } from '~/providers/DatasetsProvider.js';
import type { Dataset } from '~/providers/DatasetsProvider.js';
import { LoginPage } from '~/pages/Login.js';
import { useGetRequest } from '~/hooks/useGetRequest.js';
import { Flex } from '~/components/elements/Flex.js';
import { TopBar } from './TopBar.js';

export const Body: React.FC = () => {
  const query = useGetRequest<Session>('/session');

  return (
    <Flex full direction="column">
      {query.state === 'loading' && 'Loading...'}
      {query.state === 'error' && <LoginPage />}
      {query.state === 'success' && (
        <ProvideSession value={query.data}>
          <AuthorizedBody />
        </ProvideSession>
      )}
    </Flex>
  );
};

const AuthorizedBody: React.FC = () => {
  const { currentDataset: dataset, selectDataset: update } = useNavigation();
  const query = useGetRequest<Dataset[]>('/datasets');

  React.useEffect(() => {
    if (!dataset && query.data) {
      update({ currentDataset: query.data.at(0)?.id ?? null });
    }
  }, [dataset, query.data, update]);

  // TODO: Use error and loading screens
  return (
    <>
      {query.state === 'loading' && 'Loading...'}
      {query.state === 'error' && 'Error'}
      {query.state === 'success' && (
        <ProvideDatasets value={query.data}>
          <TopBar />
        </ProvideDatasets>
      )}
    </>
  );
};
