import React from 'react';

import { Flex } from '~/components/elements/Flex.js';
import { useGetRequest } from '~/hooks/useGetRequest.js';
import { useSessionToken } from '~/hooks/useSessionToken.js';
import { AdminPage } from '~/pages/Admin.js';
import { DatasetPage } from '~/pages/Dataset.js';
import { LoginPage } from '~/pages/Login.js';
import { ProvideDatasets } from '~/providers/DatasetsProvider.js';
import type { Dataset } from '~/providers/DatasetsProvider.js';
import { useNavigation } from '~/providers/NavigationProvider.js';
import { ProvideSession } from '~/providers/SessionProvider.js';
import type { Session } from '~/providers/SessionProvider.js';
import { TopBar } from './TopBar.js';

export const Body: React.FC = () => {
  const query = useGetRequest<Session>('/session');
  const token = useSessionToken();

  React.useEffect(() => {
    query.refetch();
  }, [token]);

  return (
    <Flex full direction="column">
      {query.state === 'loading' && 'Loading...'}
      {query.state === 'error' && <LoginPage />}
      {query.state === 'success' && (
        <ProvideSession value={{ session: query.data, refetch: query.refetch }}>
          <AuthorizedBody />
        </ProvideSession>
      )}
    </Flex>
  );
};

const AuthorizedBody: React.FC = () => {
  const { currentDataset: dataset, selectDataset: update, page } = useNavigation();
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
        <ProvideDatasets value={{ datasets: query.data, refetch: query.refetch }}>
          <TopBar />
          {page === 'admin' ? <AdminPage /> : <DatasetPage />}
        </ProvideDatasets>
      )}
    </>
  );
};
