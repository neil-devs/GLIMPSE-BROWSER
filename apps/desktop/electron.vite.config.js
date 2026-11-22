import { resolve, join } from 'path';
import { homedir } from 'os';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import react from '@vitejs/plugin-react';

/* Build output goes OUTSIDE Documents to bypass Windows Controlled Folder Access */
const BUILD_DIR = join(homedir(), '.glimpse-build');
const PROJECT_ROOT = resolve(__dirname);
const MONO_ROOT = resolve(__dirname, '..', '..');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), nodeResolve(), commonjs()],
    build: {
      outDir: join(BUILD_DIR, 'main'),
      emptyOutDir: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.js'),
        },
        output: {
          format: 'cjs',
          banner: `/* Resolve node_modules from the project, not from the build output location */\nmodule.paths.unshift(${JSON.stringify(join(PROJECT_ROOT, 'node_modules'))}, ${JSON.stringify(join(MONO_ROOT, 'node_modules'))});\n`,
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
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: join(BUILD_DIR, 'preload'),
      emptyOutDir: false,
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
      outDir: join(BUILD_DIR, 'renderer'),
      emptyOutDir: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
  },
});
