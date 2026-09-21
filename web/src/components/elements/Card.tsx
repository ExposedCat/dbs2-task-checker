import { cx } from '@styled-system/css/cx.mjs';
import { css } from '@styled-system/css/css.mjs';

import { Flex } from './Flex.js';
import type { FlexProps } from './Flex.js';

export type CardProps = FlexProps;

export const Card: React.FC<React.PropsWithChildren<CardProps>> = ({ children, className, ...flexProps }) => {
  const style = css({
    borderRadius: 'common',
    border: 'base',
    padding: 'sm',
  });

  return (
    <Flex direction="column" {...flexProps} className={cx(style, className)}>
      {children}
    </Flex>
  );
};
