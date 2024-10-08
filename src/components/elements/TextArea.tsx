import React from 'react';
import { cx } from '@styled-system/css/cx.mjs';
import { css } from '@styled-system/css/css.mjs';

export type TextAreaProps = Omit<React.HTMLProps<HTMLTextAreaElement>, 'onChange'> & {
  onChange: (value: string) => void;
};

export const TextArea: React.FC<React.PropsWithChildren<TextAreaProps>> = ({
  children,
  className,
  onChange,
  ...rest
}) => {
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
    <textarea spellCheck={false} rows={1} {...rest} className={cx(style, className)} onChange={handleChange}>
      {children}
    </textarea>
  );
};
