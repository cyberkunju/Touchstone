import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));

/**
 * Serves /ort/*.mjs raw in DEV. onnxruntime-web dynamically import()s its own
 * wasm-glue .mjs from /ort/ at runtime; Vite's dev transform pipeline rejects
 * source imports of /public files ("should not be imported from source
 * code"), which kills the WASM backend on machines/paths without WebGPU.
 * Production builds are unaffected (public/ is copied as-is). The middleware
 * must run BEFORE Vite's own transform middleware — hence `pre`.
 */
function serveOrtGlueRaw(): Plugin {
  return {
    name: 'serve-ort-glue-raw',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url.startsWith('/ort/') && url.endsWith('.mjs')) {
          const file = resolve(configDir, 'public', url.slice(1));
          if (existsSync(file)) {
            res.setHeader('Content-Type', 'text/javascript');
            // This bypasses Vite's header middleware, so the full isolation
            // header set must be applied manually. ORT spawns its pthread
            // worker FROM this .mjs: nested worker scripts in a
            // crossOriginIsolated context must themselves carry
            // COEP: require-corp or Chrome rejects them with
            // ERR_BLOCKED_BY_RESPONSE (CORP alone is not sufficient).
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
            res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
            createReadStream(file).pipe(res);
            return;
          }
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [serveOrtGlueRaw(), react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    watch: {
      // Do not watch the large, static model/runtime binaries — nor the
      // persistent puppeteer profile (Chrome holds locked SQLite WALs there)
      // nor DATA directories (files being copied in mid-write throw EBUSY on
      // fs.watch and KILL the dev server — live-caught on passport_images).
      ignored: [
        '**/public/models/**',
        '**/public/ort/**',
        '**/.puppeteer-profile/**',
        '**/bin/**',
        '**/test_cases/**',
        '**/bench/baselines/**',
        '**/test_screenshots/**',
      ],
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
