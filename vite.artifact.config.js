import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds the single-file Artifact bundle. Everything must be inlined — a
// published Artifact's CSP blocks requests to any external host — so assets are
// forced into one JS and one CSS file that scripts/build-artifact.mjs folds
// into a single HTML page.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-artifact',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: 'artifact.html',
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'bundle.js',
        assetFileNames: 'bundle[extname]',
      },
    },
  },
});
