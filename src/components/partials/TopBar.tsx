import React from 'react';

import { useSession } from '~/providers/SessionProvider.js';
import { useNavigation } from '~/providers/NavigationProvider.js';
import { useDatasets } from '~/providers/DatasetsProvider.js';
import { Logo } from '~/components/elements/Logo.js';
import { Flex } from '~/components/elements/Flex.js';
import { Button } from '~/components/elements/Button.js';
import { FaSignOutAlt } from 'react-icons/fa';
import { setSessionToken } from '~/services/session';

export const TopBar: React.FC = () => {
  const { session, refetch } = useSession();
  const datasets = useDatasets();
  const { currentDataset: dataset, selectDataset: update, page } = useNavigation();

  const onLogout = React.useCallback(() => {
    setSessionToken(null);
    refetch();
  }, [])

  return (
    <Flex justify="space-between" align="center" width="full" padding="sm" borderBottom="base">
      <Logo />
      <Flex gap="sm">
        {datasets.map((item, index) => (
          <Button
            key={index}
            label={item.name}
            variant={page === 'dataset' && item.id === dataset ? 'filled' : 'outline'}
            onClick={() => update({ currentDataset: item.id, page: 'dataset' })}
          />
        ))}
        {session.admin &&
          <>
            <Flex width="1px" background="decoration.gray" />
            <Button
              label="Admin Panel"
              variant={page === 'admin' ? "filled" : "outline"}
              colorVariant="warning"
              onClick={() => update({ page: 'admin' })}
            />
          </>}
      </Flex>
      <Button label={session.login} icon={FaSignOutAlt} variant="outline" reverse onClick={onLogout} />
    </Flex>
  );
};
