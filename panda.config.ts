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
  theme: {},
  globalCss,
  preflight: true,
  include: ['./src/**/*.{ts,tsx}'],
  exclude: [],
  jsxFramework: 'react',
  outdir: './public/styled-system',
  forceConsistentTypeExtension: true,
});
