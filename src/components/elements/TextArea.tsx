import { css } from '@styled-system/css/css.mjs';
import { cx } from '@styled-system/css/cx.mjs';
import React from 'react';

export type TextAreaProps = Omit<React.HTMLProps<HTMLTextAreaElement>, 'onChange'> & {
  onChange: (value: string) => void;
};

export const TextArea: React.FC<React.PropsWithChildren<TextAreaProps>> = React.forwardRef(
  ({ children, className, onChange, ...rest }, ref) => {
    const style = css({
      border: 'base',
      borderRadius: 'common',
      padding: 'xs',
      fontFamily: 'mono',
    });

    const handleChange: React.ChangeEventHandler<HTMLTextAreaElement> = React.useCallback(
      event => onChange(event.target.value),
      [onChange],
    );

    return (
      <textarea
        spellCheck={false}
        rows={3}
        {...rest}
        className={cx(style, className)}
        onChange={handleChange}
        ref={ref}
      >
        {children}
      </textarea>
    );
  },
);
