import type React from 'react';

import { Flex } from './Flex.js';

export const Page: React.FC<React.PropsWithChildren> = ({ children }) => {
  return (
    <Flex direction="column" justify="center" align="center" gap="sm" padding="sm" full>
      {children}
    </Flex>
  );
};
