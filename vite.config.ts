import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    watch: {
      // Do not watch the large, static model/runtime binaries.
      ignored: ['**/public/models/**', '**/public/ort/**'],
    },
  },
  preview: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // onnxruntime-web must NOT be pre-bundled: its runtime dynamically imports its
  // own wasm-glue .mjs from /ort/, and the dep-optimizer would rewrite that with
  // a `?import` query that breaks static serving. Excluding it serves ORT's ESM
  // as-is so the glue resolves correctly. zxing/comlink are pre-bundled to avoid
  // a first-load reload.
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
    include: ['zxing-wasm/reader', 'comlink'],
  },
  worker: {
    format: 'es',
  },
});
