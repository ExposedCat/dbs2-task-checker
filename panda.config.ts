import { defineConfig, defineGlobalStyles } from '@pandacss/dev';

const globalCss = defineGlobalStyles({
  '*': {
    boxSizing: 'border-box',
    fontFamily: 'body',
  },
  'html, body': {
    margin: 0,
    padding: 0,
  },
  '#root': {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
  },
});

export default defineConfig({
  theme: {
    extend: {
      tokens: {
        fonts: {
          body: { value: 'Inter' },
          mono: { value: 'JetBrainsMono' },
        },
        radii: {
          common: { value: '6px' },
        },
        colors: {
          hover: {
            light: {
              success: { value: '#ECFDF3d9' },
              warning: { value: '#FFFAEBd9' },
              error: { value: '#FEF3F2d9' },
              active: { value: '#DCEFFCd9' },
              gray: { value: '#F2F4F7d9' },
            },
            dark: {
              success: { value: '#12B76Ad9' },
              warning: { value: '#DC6803d9' },
              error: { value: '#F04438d9' },
              active: { value: '#0065bdd9' },
              gray: { value: '#667085d9' },
            },
          },
          light: {
            success: { value: '#ECFDF3' },
            warning: { value: '#FFFAEB' },
            error: { value: '#FEF3F2' },
            active: { value: '#DCEFFC' },
            gray: { value: '#F2F4F7' },
          },
          dark: {
            success: { value: '#12B76A' },
            warning: { value: '#DC6803' },
            error: { value: '#F04438' },
            active: { value: '#0065bd' },
            gray: { value: '#667085' },
          },
          text: {
            normal: { value: '#1D2939' },
            label: { value: '#475467' },
            light: { value: '#667085' },
            success: { value: '#027A48' },
            warning: { value: '#B54708' },
            error: { value: '#B42318' },
            active: { value: '#0157a2' },
            gray: { value: '#344054' },
          },
          decoration: {
            success: { value: '#6CE9A6' },
            warning: { value: '#FEC84B' },
            error: { value: '#FDA29B' },
            active: { value: '#8da4f4' },
            gray: { value: '#D0D5DD' },
          },
        },
        spacing: {
          xs: { value: '4px' },
          sm: { value: '8px' },
          md: { value: '16px' },
          lg: { value: '32px' },
        },
        borders: {
          base: { value: '1px solid {colors.decoration.gray}' },
          error: { value: '1px solid {colors.decoration.error}' },
          success: { value: '1px solid {colors.decoration.success}' },
          active: { value: '1px solid {colors.decoration.active}' },
        },
        sizes: {
          container: {
            xs: { value: '40px' },
            sm: { value: '120px' },
            md: { value: '240px' },
            lg: { value: '480px' },
            xl: { value: '600px' },
            full: { value: '1000px' },
          },
        },
      },
    },
  },
  globalCss,
  preflight: true,
  include: ['./src/**/*.{ts,tsx}'],
  exclude: [],
  jsxFramework: 'react',
  outdir: './public/styled-system',
  forceConsistentTypeExtension: true,
});
