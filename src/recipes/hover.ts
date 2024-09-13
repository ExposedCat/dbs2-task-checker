import type { PropsFromCVA } from '~/utils/types.js';
import type { ColorToken } from '../../public/styled-system/tokens/tokens.mjs';
import { cva } from '../../public/styled-system/css/cva.mjs';
import type { ColorStylesProps } from './colors.js';

const hoverEffect = (color: ColorToken, border = true) => {
  const style = `token(colors.${color})`;

  return {
    _hover: {
      ...(border && { borderColor: style }),
      bgColor: style,
    },
  };
};

export const hoverStyles = cva({
  base: {
    transitionProperty: 'background-color, border-color, color, opacity',
    transitionDuration: 'token(durations.fast)',
    transitionTimingFunction: 'token(easings.easeInOut)',
  },
  variants: {
    hoverStyle: {
      strong: {},
      subtle: {},
    },
    colorVariant: {
      white: {},
      active: {},
      gray: {},
      success: {},
      warning: {},
      error: {},
    },
    variant: {
      filled: {},
      light: {},
      outline: {},
      ghost: {},
      link: {
        _hover: {
          textDecoration: 'underline',
        },
      },
    },
  },
  compoundVariants: [
    {
      variant: 'filled',
      colorVariant: 'active',
      css: hoverEffect('hover.dark.active'),
    },
    {
      variant: 'filled',
      colorVariant: 'gray',
      css: hoverEffect('hover.dark.gray'),
    },
    {
      variant: 'filled',
      colorVariant: 'success',
      css: hoverEffect('hover.dark.success'),
    },
    {
      variant: 'filled',
      colorVariant: 'warning',
      css: hoverEffect('hover.dark.warning'),
    },
    {
      variant: 'filled',
      colorVariant: 'error',
      css: hoverEffect('hover.dark.error'),
    },
    {
      variant: 'filled',
      colorVariant: 'white',
      css: hoverEffect('light.gray'),
    },
    {
      variant: 'ghost',
      colorVariant: 'active',
      css: hoverEffect('light.active'),
    },
    {
      variant: 'ghost',
      colorVariant: 'gray',
      css: hoverEffect('light.gray'),
    },
    {
      variant: 'ghost',
      colorVariant: 'success',
      css: hoverEffect('light.success'),
    },
    {
      variant: 'ghost',
      colorVariant: 'warning',
      css: hoverEffect('light.warning'),
    },
    {
      variant: 'ghost',
      colorVariant: 'error',
      css: hoverEffect('light.error'),
    },
    {
      variant: 'ghost',
      colorVariant: 'white',
      css: hoverEffect('light.gray'),
    },
    {
      variant: 'light',
      colorVariant: 'active',
      css: hoverEffect('hover.light.active'),
    },
    {
      variant: 'light',
      colorVariant: 'gray',
      css: hoverEffect('hover.light.gray'),
    },
    {
      variant: 'light',
      colorVariant: 'success',
      css: hoverEffect('hover.light.success'),
    },
    {
      variant: 'light',
      colorVariant: 'warning',
      css: hoverEffect('hover.light.warning'),
    },
    {
      variant: 'light',
      colorVariant: 'error',
      css: hoverEffect('hover.light.error'),
    },
    {
      variant: 'light',
      colorVariant: 'white',
      css: hoverEffect('light.gray'),
    },
    {
      variant: 'outline',
      colorVariant: 'active',
      css: hoverEffect('hover.light.active', false),
    },
    {
      variant: 'outline',
      colorVariant: 'gray',
      css: hoverEffect('hover.light.gray', false),
    },
    {
      variant: 'outline',
      colorVariant: 'success',
      css: hoverEffect('hover.light.success', false),
    },
    {
      variant: 'outline',
      colorVariant: 'warning',
      css: hoverEffect('hover.light.warning', false),
    },
    {
      variant: 'outline',
      colorVariant: 'error',
      css: hoverEffect('hover.light.error', false),
    },
    {
      variant: 'outline',
      colorVariant: 'white',
      hoverStyle: 'strong', // TODO: hover styles?
      css: hoverEffect('light.gray', false),
    },
    {
      variant: 'outline',
      colorVariant: 'white',
      hoverStyle: 'subtle',
      css: hoverEffect('light.gray', false),
    },
  ],
  defaultVariants: {
    colorVariant: 'active',
    variant: 'filled',
    hoverStyle: 'strong',
  },
});

export type HoverStylesProps = PropsFromCVA<typeof hoverStyles>;
export type HoverColorStylesProps = ColorStylesProps & HoverStylesProps;
