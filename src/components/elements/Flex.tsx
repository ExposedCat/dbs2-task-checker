import { Flex as _Flex } from '@styled-system/jsx/flex.mjs';
import type { FlexProps as _FlexProps } from '@styled-system/jsx/flex.mjs';
import { cx } from '@styled-system/css/cx.mjs';
import { cva } from '@styled-system/css/cva.mjs';

import type { PropsFromCVA } from '~/utils/types.js';

const flexRecipe = cva({
  variants: {
    full: {
      true: {
        width: 'full',
        height: 'full',
      },
    },
  },
});

export type FlexProps = _FlexProps & PropsFromCVA<typeof flexRecipe>;

export const Flex = ({ className, full, ...rest }: FlexProps) => {
  return <_Flex className={cx(flexRecipe({ full }), className)} {...rest} />;
};
