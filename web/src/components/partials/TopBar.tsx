import React from 'react';

import { FaSignOutAlt } from 'react-icons/fa';
import { Button } from '~/components/elements/Button.js';
import { Flex } from '~/components/elements/Flex.js';
import { Logo } from '~/components/elements/Logo.js';
import { useDatasets } from '~/providers/DatasetsProvider.js';
import { useNavigation } from '~/providers/NavigationProvider.js';
import { useSession } from '~/providers/SessionProvider.js';
import { setSessionToken } from '~/services/session';

export const TopBar: React.FC = () => {
  const { session, refetch } = useSession();
  const { datasets } = useDatasets();
  const { currentDataset: dataset, selectDataset: update, page } = useNavigation();

  const onLogout = React.useCallback(() => {
    setSessionToken(null);
    refetch();
  }, [refetch]);

  return (
    <Flex justify="space-between" align="center" width="full" padding="sm" borderBottom="base">
      <Logo />
      <Flex gap="sm">
        {datasets.map((item, index) => (
          <Button
            key={index}
            label={item.name}
            variant={page === 'dataset' && item.id === dataset ? 'filled' : 'outline'}
            disabled={dataset !== item.id && session.testSession !== null}
            onClick={() => update({ currentDataset: item.id, page: 'dataset' })}
          />
        ))}
        {session.admin && (
          <>
            <Flex width="1px" background="decoration.gray" />
            <Button
              label="Datasets"
              variant={page === 'datasets' ? 'filled' : 'outline'}
              colorVariant="warning"
              onClick={() => update({ page: 'datasets' })}
            />
            <Button
              label="Users"
              variant={page === 'users' ? 'filled' : 'outline'}
              colorVariant="warning"
              onClick={() => update({ page: 'users' })}
            />
          </>
        )}
      </Flex>
      <Button label={session.login} icon={FaSignOutAlt} variant="outline" reverse onClick={onLogout} />
    </Flex>
  );
};
