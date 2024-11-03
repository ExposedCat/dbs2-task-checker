import { Flex as _Flex } from '@styled-system/jsx/flex.mjs';
import type { FlexProps as _FlexProps } from '@styled-system/jsx/flex.mjs';
import { cx } from '@styled-system/css/cx.mjs';
import { cva } from '@styled-system/css/cva.mjs';

import type { PropsFromCVA } from '~/utils/types.js';

const labelRecipe = cva({
  variants: {
    kind: {
      header: {
        fontSize: '2xl',
        fontWeight: 'bold'
      }
    },
    color: {
      error: { color: 'text.error' },
      warning: { color: 'text.warning' },
      normal: { color: 'text.normal' },
      success: { color: 'text.success' },
    },
  },
});

export type LabelProps = Omit<React.HTMLProps<HTMLSpanElement> & PropsFromCVA<typeof labelRecipe>, 'text'> & {
  text: React.ReactNode;
};

export const Label = ({ className, color, text, kind, ...rest }: LabelProps) => {
  return (
    <span className={cx(labelRecipe({ color, kind }), className)} {...rest}>
      {text}
    </span>
  );
};
