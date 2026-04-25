import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import type { Plugin } from 'vite';

const uiHtmlPath = resolve(__dirname, 'dist/index.html');

// Replaces the __html__ identifier in code/index.ts with the inlined UI HTML.
// In watch mode, also watches dist/index.html so a UI rebuild triggers a code rebuild.
function injectUiHtml(): Plugin {
  return {
    name: 'inject-ui-html',
    transform(code, id) {
      if (!id.endsWith('src/code/index.ts')) return null;
      this.addWatchFile(uiHtmlPath);
      if (!existsSync(uiHtmlPath)) {
        this.warn('dist/index.html not found — run build:ui first');
        return { code: code.replace(/__html__/g, '""'), map: null };
      }
      const html = readFileSync(uiHtmlPath, 'utf-8');
      return { code: code.replace(/__html__/g, JSON.stringify(html)), map: null };
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode === 'ui') {
    return {
      root: resolve(__dirname, 'src/ui'),
      plugins: [svelte(), viteSingleFile()],
      build: {
        outDir: resolve(__dirname, 'dist'),
        emptyOutDir: false,
        rollupOptions: {
          onwarn(warning, warn) {
            if (warning.code === 'INVALID_ANNOTATION') return;
            warn(warning);
          },
        },
      },
      esbuild: {
        logOverride: { 'js-comment-in-css': 'silent' },
      },
    };
  }

  // mode === 'code' (default)
  return {
    plugins: [injectUiHtml()],
    build: {
      // Figma's plugin sandbox (QuickJS) does not parse ES2020 syntax.
      // Setting es2017 causes esbuild to transpile ?? and ?. to compatible equivalents.
      target: 'es2017',
      outDir: 'dist',
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, 'src/code/index.ts'),
        formats: ['iife'],
        name: 'code',
      },
      rollupOptions: {
        output: { entryFileNames: 'code.js' },
      },
    },
  };
});
