import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), nodeResolve(), commonjs()],
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
        ],
      },
      ssr: true,
    },
    ssr: {
      noExternal: true,
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
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
    plugins: [
      react(),
      {
        name: 'remove-crossorigin',
        transformIndexHtml(html) {
          return html.replace(/ crossorigin/g, '');
        }
      }
    ],
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
