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
};

export const Popup: React.FC<React.PropsWithChildren<PopupProps>> = ({ open, title, children, onClose }) => {
  if (!open) return null;

  const onBackgroundClick = React.useCallback<React.MouseEventHandler>(event => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }, []);

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
            minWidth: 'container.lg',
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
