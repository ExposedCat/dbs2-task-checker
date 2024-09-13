import type { PropsFromCVA } from '~/utils/types';
import { cva } from '../../public/styled-system/css/cva.mjs';

export const colorStyles = cva({
  base: {
    borderWidth: '1px',
  },
  variants: {
    colorVariant: {
      white: { color: 'black' },
      active: { color: 'text.active' },
      gray: { color: 'text.gray' },
      success: { color: 'text.success' },
      warning: { color: 'text.warning' },
      error: { color: 'text.error' },
    },
    variant: {
      filled: { color: 'white' },
      light: {},
      outline: {},
      ghost: {
        borderColor: 'transparent',
        bgColor: 'transparent',
      },
      link: {
        border: 'none',
        paddingY: 0,
        paddingX: 0,
        bgColor: 'transparent',
      },
    },
  },
  compoundVariants: [
    {
      variant: 'filled',
      colorVariant: 'active',
      css: {
        borderColor: 'dark.active',
        bgColor: 'dark.active',
      },
    },
    {
      variant: 'filled',
      colorVariant: 'gray',
      css: {
        borderColor: 'dark.gray',
        bgColor: 'dark.gray',
      },
    },
    {
      variant: 'filled',
      colorVariant: 'success',
      css: {
        borderColor: 'dark.success',
        bgColor: 'dark.success',
      },
    },
    {
      variant: 'filled',
      colorVariant: 'warning',
      css: {
        borderColor: 'dark.warning',
        bgColor: 'dark.warning',
      },
    },
    {
      variant: 'filled',
      colorVariant: 'error',
      css: {
        borderColor: 'dark.error',
        bgColor: 'dark.error',
      },
    },
    {
      variant: 'filled',
      colorVariant: 'white',
      css: {
        borderColor: 'white',
        bgColor: 'white',
        color: 'black',
      },
    },
    {
      variant: 'light',
      colorVariant: 'active',
      css: {
        borderColor: 'light.active',
        bgColor: 'light.active',
      },
    },
    {
      variant: 'light',
      colorVariant: 'gray',
      css: {
        borderColor: 'light.gray',
        bgColor: 'light.gray',
      },
    },
    {
      variant: 'light',
      colorVariant: 'success',
      css: {
        borderColor: 'light.success',
        bgColor: 'light.success',
      },
    },
    {
      variant: 'light',
      colorVariant: 'warning',
      css: {
        borderColor: 'light.warning',
        bgColor: 'light.warning',
      },
    },
    {
      variant: 'light',
      colorVariant: 'error',
      css: {
        borderColor: 'light.error',
        bgColor: 'light.error',
      },
    },
    {
      variant: 'light',
      colorVariant: 'white',
      css: {
        borderColor: 'white',
        bgColor: 'white',
      },
    },
    {
      variant: 'outline',
      colorVariant: 'active',
      css: {
        borderColor: 'decoration.active',
        bgColor: 'light.active',
      },
    },
    {
      variant: 'outline',
      colorVariant: 'gray',
      css: {
        borderColor: 'decoration.gray',
        bgColor: 'light.gray',
      },
    },
    {
      variant: 'outline',
      colorVariant: 'success',
      css: {
        borderColor: 'decoration.success',
        bgColor: 'light.success',
      },
    },
    {
      variant: 'outline',
      colorVariant: 'warning',
      css: {
        borderColor: 'decoration.warning',
        bgColor: 'light.warning',
      },
    },
    {
      variant: 'outline',
      colorVariant: 'error',
      css: {
        borderColor: 'decoration.error',
        bgColor: 'light.error',
      },
    },
    {
      variant: 'outline',
      colorVariant: 'white',
      css: {
        borderColor: 'decoration.gray',
        bgColor: 'white',
      },
    },
    {
      variant: 'link',
      colorVariant: 'active',
      css: { color: 'text.active' },
    },
    {
      variant: 'link',
      colorVariant: 'gray',
      css: { color: 'text.gray' },
    },
    {
      variant: 'link',
      colorVariant: 'success',
      css: { color: 'text.success' },
    },
    {
      variant: 'link',
      colorVariant: 'warning',
      css: { color: 'text.warning' },
    },
    {
      variant: 'link',
      colorVariant: 'error',
      css: { color: 'text.error' },
    },
    {
      variant: 'link',
      colorVariant: 'white',
      css: { color: 'text.white' },
    },
  ],
  defaultVariants: {
    colorVariant: 'active',
    variant: 'filled',
  },
});

export type ColorStylesProps = PropsFromCVA<typeof colorStyles>;
