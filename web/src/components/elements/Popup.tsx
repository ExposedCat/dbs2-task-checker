import { css } from '@styled-system/css/css.mjs';
import React from 'react';
import { ImCross } from 'react-icons/im';
import { Button } from './Button';
import { Flex } from './Flex';
import { Label } from './Label';

export type PopupProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  wide?: boolean;
};

export const Popup: React.FC<React.PropsWithChildren<PopupProps>> = ({ open, title, children, onClose, wide = false }) => {
  const onBackgroundClick = React.useCallback<React.MouseEventHandler>(
    event => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <>
      <Flex
        full
        justify="center"
        align="center"
        onClick={onBackgroundClick}
        className={css({
          left: 0,
          top: 0,
          position: 'fixed',
          background: 'hover.dark.gray',
          zIndex: 100,
        })}
      >
        <Flex
          direction="column"
          gap="sm"
          className={css({
            background: 'white',
            padding: 'sm',
            borderRadius: 'common',
            minWidth: wide ? '0' : 'container.lg',
            width: wide ? 'min(900px, calc(100vw - 32px))' : undefined,
            maxHeight: wide ? 'calc(100dvh - 32px)' : undefined,
            overflowY: wide ? 'auto' : undefined,
          })}
        >
          <Flex justify="space-between">
            <Label kind="header" text={title} />
            <Button icon={ImCross} onClick={onClose} />
          </Flex>
          {children}
        </Flex>
      </Flex>
    </>
  );
};
