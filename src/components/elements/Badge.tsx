import { cx } from '@styled-system/css/cx.mjs';
import { css } from '@styled-system/css/css.mjs';

import { Label } from './Label.js';
import type { LabelProps } from './Label.js';

export type BadgeProps = LabelProps;

export const Badge: React.FC<BadgeProps> = ({ className, ...rest }) => {
  const styles = css({
    backgroundColor: 'light.active',
    borderWidth: 'thin',
    borderColor: 'dark.active',
    color: 'dark.active',
    borderRadius: 'full',
    paddingX: 'xs',
    height: 'min-content',
    textTransform: 'uppercase',
    fontSize: 'xs',
    whiteSpace: 'nowrap',
  });

  return <Label className={cx(styles, className)} {...rest} />;
};
