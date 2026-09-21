import { css } from '@styled-system/css/css.mjs';
import { cx } from '@styled-system/css/cx.mjs';
import type React from 'react';

import type { IconType } from 'react-icons';
import { colorStyles } from '~/recipes/colors';
import { type HoverColorStylesProps, hoverStyles } from '~/recipes/hover.js';

export type ButtonProps = React.HTMLAttributes<HTMLButtonElement> &
  HoverColorStylesProps & {
    label?: string;
    icon?: IconType;
    reverse?: boolean;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
  };

export const Button: React.FC<ButtonProps> = props => {
  const { label, icon, disabled, variant, colorVariant, onClick, reverse = false, className, ...rest } = props;

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
    aspectRatio: !label && icon ? '1 / 1' : undefined,
  });

  return (
    <button
      className={cx(
        className,
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
