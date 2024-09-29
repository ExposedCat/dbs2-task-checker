import React from 'react';
import { cx } from '@styled-system/css/cx.mjs';
import { css } from '@styled-system/css/css.mjs';

import { hoverStyles, type HoverColorStylesProps } from '~/recipes/hover.js';
import { colorStyles } from '~/recipes/colors';

export type ButtonProps = React.HTMLAttributes<HTMLButtonElement> &
  HoverColorStylesProps & {
    label: string;
    disabled?: boolean;
  };

export const Button: React.FC<ButtonProps> = props => {
  const { label, disabled, variant, colorVariant, onClick, ...rest } = props;

  const styles = css({
    padding: 'sm',
    borderRadius: 'common',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  });

  return (
    <button
      className={cx(
        //
        styles,
        colorStyles({ variant, colorVariant }),
        !disabled && hoverStyles({ variant, colorVariant }),
      )}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      {...rest}
    >
      {label}
    </button>
  );
};
