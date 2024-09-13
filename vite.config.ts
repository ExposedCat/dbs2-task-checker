import path from 'path';

import { defineConfig } from 'vite';
import type { BuildOptions, PluginOption, PreviewOptions, ServerOptions, UserConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const resolve = {
    alias: {
      '~': path.resolve(__dirname, './src'),
      '@styled-system': path.resolve(__dirname, './public/styled-system'),
      'stream/web': 'web-streams-polyfill',
    },
  };

  const basePlugins: PluginOption[] = [react()];

  const modePlugins: PluginOption[] = mode === 'private' ? [] : [];

  const buildOptions: BuildOptions = {
    sourcemap: mode !== 'private',
  };

  const devServer: ServerOptions = {
    port: 3000,
    host: '127.0.0.1',
    watch: {},
  };

  const devPreviewServer: PreviewOptions = {
    port: 3001,
    host: '127.0.0.1',
  };

  return {
    build: buildOptions,
    plugins: [...basePlugins, ...modePlugins],
    server: mode === 'private' ? devServer : undefined,
    preview: mode === 'private' ? devPreviewServer : undefined,
    publicDir: './public',
    resolve,
    envDir: './environment',
  } as UserConfig;
});
