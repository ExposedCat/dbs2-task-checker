import type { PropsFromCVA } from '../utils/types.ts';
import { type FlexProps as _FlexProps } from '../../public/styled-system/jsx/flex.mjs';
import { Flex as _Flex } from '../../public/styled-system/jsx/flex.mjs';
import { cx } from '../../public/styled-system/css/cx.mjs';
import { cva } from '../../public/styled-system/css/cva.mjs';

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
