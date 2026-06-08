import { defineConfig } from 'vitest/config';

// Vitest configuration for the Edge DocGraph Engine.
// Unit tests target pure, deterministic domain logic (parsers, validators,
// verifier, hypothesis generation). Browser/worker/model code is excluded.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', 'test_screenshots'],
    coverage: {
      provider: 'v8',
      include: [
        'src/parsers/**',
        'src/verifier/**',
        'src/docgraph/**',
        'src/core/**',
      ],
      reporter: ['text', 'json-summary'],
    },
  },
});
