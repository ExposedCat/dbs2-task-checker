import React from 'react';

import { Flex } from './Flex.js';

export const Page: React.FC<React.PropsWithChildren> = ({ children }) => {
  return (
    <Flex direction="column" justify="center" align="center" gap="sm" full>
      <Flex direction="column" justify="center" align="center" gap="sm" full>
        {children}
      </Flex>
    </Flex>
  );
};
