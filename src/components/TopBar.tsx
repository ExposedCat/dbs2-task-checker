import React from 'react';

import { useRequest } from '~/hooks/request.js';
import { Flex } from '~/components/Flex';
import { css } from '../../public/styled-system/css/css.mjs';
import { useNavigation } from './Navigation.js';
import { Button } from './Button.js';

export const TopBar: React.FC = () => {
  const query = useRequest<{ name: string }[]>('/datasets');

  const { dataset, update } = useNavigation();

  React.useEffect(() => {
    if (!dataset && query.data) {
      update({ dataset: query.data.at(0)?.name ?? null });
    }
  }, [dataset, query.data, update]);

  return (
    <Flex justify="space-between" align="center" width="full" padding="sm" borderBottom="base">
      <img
        src="/cvut.jpg"
        className={css({
          maxWidth: 'container.sm',
        })}
      />
      <Flex gap="sm">
        {query.state === 'loading' && 'Loading...'}
        {query.state === 'error' && 'Error'}
        {query.state === 'success' &&
          query.data.map((item, index) => (
            <Button
              key={index}
              label={item.name}
              variant={item.name === dataset ? 'filled' : 'outline'}
              onClick={() => update({ dataset: item.name })}
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
        T
      </Flex>
    </Flex>
  );
};
