import React from 'react';

import { useSession } from '~/providers/SessionProvider.js';
import { useNavigation } from '~/providers/NavigationProvider.js';
import { useDatasets } from '~/providers/DatasetsProvider.js';
import { Logo } from '~/components/elements/Logo.js';
import { Flex } from '~/components/elements/Flex.js';
import { Button } from '~/components/elements/Button.js';

export const TopBar: React.FC = () => {
  const { session } = useSession();
  const datasets = useDatasets();
  const { currentDataset: dataset, selectDataset: update } = useNavigation();

  return (
    <Flex justify="space-between" align="center" width="full" padding="sm" borderBottom="base">
      <Logo />
      <Flex gap="sm">
        {datasets.map((item, index) => (
          <Button
            key={index}
            label={item.name}
            variant={item.id === dataset ? 'filled' : 'outline'}
            onClick={() => update({ currentDataset: item.id })}
          />
        ))}
      </Flex>
      <Flex
        justify="center"
        align="center"
        rounded="full"
        color="white"
        backgroundColor="dark.active"
        width="container.xs"
        height="container.xs"
      >
        {session.login[0]}
      </Flex>
    </Flex>
  );
};
