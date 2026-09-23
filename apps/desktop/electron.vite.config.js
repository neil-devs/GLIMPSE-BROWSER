import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import commonjs from '@rollup/plugin-commonjs';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), commonjs()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.js'),
        },
        output: {
          format: 'cjs',
        },
        external: [
          'electron',
          'better-sqlite3',
          'electron-log',
          'electron-updater',
        ],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin(), commonjs()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.js'),
          'tab-preload': resolve(__dirname, 'src/preload/tab-preload.js'),
        },
        output: {
          format: 'cjs',
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    root: resolve(__dirname, 'src/renderer'),
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
  },
});
