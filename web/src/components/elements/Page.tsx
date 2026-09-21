import type React from 'react';

import { css } from '@styled-system/css/css.mjs';
import { Flex } from './Flex.js';

// The page fills whatever height the (column-flex) body leaves under the top bar. `safe center`
// keeps short content (login, question card) vertically centred but falls back to flex-start
// when the content is taller than the viewport, so nothing gets clipped above the top edge and
// the document scrolls normally.
const pageStyles = css({
  width: 'full',
  maxWidth: '100vw',
  flex: '1 1 auto',
  justifyContent: 'safe center',
});

export const Page: React.FC<React.PropsWithChildren> = ({ children }) => {
  return (
    <Flex direction="column" align="center" gap="sm" padding="sm" className={pageStyles}>
      {children}
    </Flex>
  );
};
