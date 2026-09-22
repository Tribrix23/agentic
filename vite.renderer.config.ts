import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig({
  base: './',
  plugins: [react({ babel: { compact: false } })],
  worker: { format: 'es' },
  build: { sourcemap: false, chunkSizeWarningLimit: 2000 },
  resolve: {
    alias: [
      { find: '@casualoffice/docs/styles.css', replacement: path.resolve(__dirname, 'downloads/casual-office/docx-editor/packages/react/src/styles/editor.css') },
      { find: /^@casualoffice\/docs$/, replacement: path.resolve(__dirname, 'downloads/casual-office/docx-editor/packages/react/src/index.ts') },
      { find: /^@casualoffice\/docs\/(.*)/, replacement: path.resolve(__dirname, 'downloads/casual-office/docx-editor/packages/react/src/$1') },
      { find: /^@eigenpal\/docx-core$/, replacement: path.resolve(__dirname, 'downloads/casual-office/docx-editor/packages/core/src/core.ts') },
      { find: /^@eigenpal\/docx-core\/(.*)/, replacement: path.resolve(__dirname, 'downloads/casual-office/docx-editor/packages/core/src/$1') },
      { find: /^@casualoffice\/docops$/, replacement: path.resolve(__dirname, 'downloads/casual-office/docx-editor/packages/docops/src/index.ts') },
      { find: /^@casualoffice\/docops\/(.*)/, replacement: path.resolve(__dirname, 'downloads/casual-office/docx-editor/packages/docops/src/$1') },
      { find: /^@schnsrw\/design-system$/, replacement: path.resolve(__dirname, 'downloads/casual-office/docx-editor/vendor/design-system/src/index.ts') },
      { find: /^@schnsrw\/design-system\/(.*)/, replacement: path.resolve(__dirname, 'downloads/casual-office/docx-editor/vendor/design-system/src/$1') }
    ]
  },
  optimizeDeps: {
    exclude: ['monaco-editor'],
    include: ['docx-preview'],
  }
});
