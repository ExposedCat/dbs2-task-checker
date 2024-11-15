import { css } from '@styled-system/css/css.mjs';
import { cx } from '@styled-system/css/cx.mjs';
import React from 'react';

import { colorStyles } from '~/recipes/colors';
import type { ColorStylesProps } from '~/recipes/colors';

export type InputProps = React.HTMLProps<HTMLInputElement> &
  ColorStylesProps & {
    onValueChange?: (value: string) => void;
  };

export const Input: React.FC<InputProps> = React.forwardRef((props, ref) => {
  const { label, variant = 'outline', colorVariant, disabled, onValueChange, className, ...native } = props;

  const styles = css({
    padding: 'sm',
    borderRadius: 'common',
    cursor: disabled ? 'not-allowed' : 'text',
  });

  const onChange = React.useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    event => {
      native.onChange?.(event);
      onValueChange?.((event.target as HTMLInputElement).value);
    },
    [native.onChange, onValueChange],
  );

  return (
    <input
      ref={ref}
      className={cx(styles, colorStyles({ variant, colorVariant }), className)}
      disabled={disabled}
      {...native}
      onChange={onChange}
    />
  );
});
