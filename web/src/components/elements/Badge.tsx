import { css } from '@styled-system/css/css.mjs';
import { cva } from '@styled-system/css/cva.mjs';
import { cx } from '@styled-system/css/cx.mjs';

import { Label } from './Label.js';
import type { LabelProps } from './Label.js';

export type BadgeProps = LabelProps & {
  preserveCase?: boolean;
  tone?: 'active' | 'success' | 'warning' | 'error';
};

const toneStyles = cva({ variants: { tone: {
  active: { backgroundColor: 'light.active', borderColor: 'dark.active', color: 'dark.active' },
  success: { backgroundColor: 'light.success', borderColor: 'decoration.success', color: 'text.success' },
  warning: { backgroundColor: 'light.warning', borderColor: 'decoration.warning', color: 'text.warning' },
  error: { backgroundColor: 'light.error', borderColor: 'decoration.error', color: 'text.error' },
} }, defaultVariants: { tone: 'active' } });

export const Badge: React.FC<BadgeProps> = ({ className, preserveCase = false, tone = 'active', ...rest }) => {
  const styles = css({
    borderWidth: 'thin',
    borderRadius: 'full',
    paddingX: 'xs',
    height: 'min-content',
    textTransform: preserveCase ? undefined : 'uppercase',
    fontSize: 'xs',
    whiteSpace: 'nowrap',
  });

  return <Label className={cx(styles, toneStyles({ tone }), className)} {...rest} />;
};
