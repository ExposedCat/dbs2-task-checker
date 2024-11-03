import React from 'react';
import { cx } from '@styled-system/css/cx.mjs';
import { css } from '@styled-system/css/css.mjs';

import { hoverStyles, type HoverColorStylesProps } from '~/recipes/hover.js';
import { colorStyles } from '~/recipes/colors';
import { IconType } from 'react-icons';

export type ButtonProps = React.HTMLAttributes<HTMLButtonElement> &
  HoverColorStylesProps & {
    label?: string;
    icon?: IconType;
    reverse?: boolean;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
  };

export const Button: React.FC<ButtonProps> = props => {
  const { label, icon, disabled, variant, colorVariant, onClick, reverse = false, ...rest } = props;

  const styles = css({
    display: 'flex',
    flexDirection: reverse ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'sm',
    padding: 'sm',
    borderRadius: 'common',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    aspectRatio: !label && icon ? '1 / 1' : undefined
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
      {icon?.({})}
      {label}
    </button>
  );
};
