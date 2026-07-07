import { defineConfig } from 'vitest/config';

// Staging-only config: tests src-destined patches while src/ is frozen
// during certification chain runs. Deleted when patches move into src/.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['.staging/src-patches/**/*.test.ts'],
  },
});
