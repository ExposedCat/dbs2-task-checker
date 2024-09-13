import React from 'react';

import { hoverStyles, type HoverColorStylesProps } from '~/recipes/hover.js';
import { colorStyles } from '~/recipes/colors';
import { cx } from '../../public/styled-system/css/cx.mjs';
import { css } from '../../public/styled-system/css/css.mjs';

export type ButtonProps = React.HTMLAttributes<HTMLButtonElement> &
  HoverColorStylesProps & {
    label: string;
    disabled?: boolean;
  };

export const Button: React.FC<ButtonProps> = props => {
  const { label, disabled, variant, colorVariant, ...rest } = props;

  const styles = css({
    padding: 'sm',
    borderRadius: 'common',
    cursor: disabled ? 'not-allowed' : 'pointer',
  });

  return (
    <button
      className={cx(
        //
        styles,
        colorStyles({ variant, colorVariant }),
        hoverStyles({ variant, colorVariant }),
      )}
      disabled={disabled}
      {...rest}
    >
      {label}
    </button>
  );
};
