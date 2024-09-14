import React from 'react';
import { cx } from '@styled-system/css/cx.mjs';
import { css } from '@styled-system/css/css.mjs';

import { colorStyles } from '~/recipes/colors';
import type { ColorStylesProps } from '~/recipes/colors';

export type InputProps = React.HTMLProps<HTMLInputElement> &
  ColorStylesProps & {
    onValueChange?: (value: string) => void;
  };

export const Input: React.FC<InputProps> = props => {
  const { label, variant = 'outline', colorVariant, disabled, onValueChange, ...native } = props;

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
    [native, onValueChange],
  );

  return (
    <input
      className={cx(styles, colorStyles({ variant, colorVariant }))}
      disabled={disabled}
      {...native}
      onChange={onChange}
    />
  );
};
