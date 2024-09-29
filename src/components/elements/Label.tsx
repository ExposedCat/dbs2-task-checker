import { Flex as _Flex } from '@styled-system/jsx/flex.mjs';
import type { FlexProps as _FlexProps } from '@styled-system/jsx/flex.mjs';
import { cx } from '@styled-system/css/cx.mjs';
import { cva } from '@styled-system/css/cva.mjs';

import type { PropsFromCVA } from '~/utils/types.js';

const labelRecipe = cva({
  variants: {
    color: {
      error: { color: 'text.error' },
      warning: { color: 'text.warning' },
      normal: { color: 'text.normal' },
    },
  },
});

export type LabelProps = Omit<React.HTMLProps<HTMLSpanElement> & PropsFromCVA<typeof labelRecipe>, 'text'> & {
  text: React.ReactNode;
};

export const Label = ({ className, color, text, ...rest }: LabelProps) => {
  return (
    <span className={cx(labelRecipe({ color }), className)} {...rest}>
      {text}
    </span>
  );
};
