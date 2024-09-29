import { css } from '@styled-system/css/css.mjs';

export const Logo: React.FC = () => (
  <img
    src="/cvut.jpg"
    className={css({
      rounded: 'common',
      maxWidth: 'container.sm',
    })}
  />
);
