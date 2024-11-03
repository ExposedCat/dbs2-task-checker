import React from 'react';
import { css } from '@styled-system/css/css.mjs';

import { colorStyles } from '~/recipes/colors';
import { Button } from './Button';
import { InputProps } from './Input';

export type FilePickerProps = Omit<InputProps, 'type'>;

export const FilePicker: React.FC<FilePickerProps> = React.forwardRef((props, ref) => {
  const { label, variant = 'outline', colorVariant = 'active', disabled, onValueChange, ...native } = props;

  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useImperativeHandle(ref, () => inputRef.current!);

  const styles = css({ display: 'none' });
  const [file, setFile] = React.useState<string | null>(null);

  const onChange = React.useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    event => {
      native.onChange?.(event);
      setFile(event.target.files?.[0]?.name ?? null);
      onValueChange?.((event.target as HTMLInputElement).value);
    },
    [native, onValueChange],
  );

  const forwardClick = React.useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <>
      <Button type="button" {...{ variant, colorVariant, disabled }} label={file ?? "Select file..."} onClick={forwardClick} />
      <input
        type="file"
        id="file-picker"
        ref={inputRef}
        className={styles}
        disabled={disabled}
        {...native}
        onChange={onChange}
      />
    </>
  );
});
