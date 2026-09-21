/**
 * Vitest config for tests that need REAL external services.
 *
 * `src/tests/integration/**` and `src/tests/e2e/gemini-integration/**` are
 * excluded by BOTH vitest.config.ts and vitest.config.integration.ts (they need
 * live APIs, credentials or a running server). The effect was that nothing
 * collected them at all: 20 test files never executed anywhere, and
 * `pnpm test:agi-actions-api` - which CI runs - reported success while finding
 * zero tests.
 *
 * This config makes them runnable on demand. It is deliberately NOT part of the
 * gated pipeline: expect failures without the relevant credentials/server.
 *
 * Run: pnpm test:external
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/tests/integration/**/*.test.ts',
      'src/tests/e2e/gemini-integration/**/*.test.ts',
    ],
    exclude: ['node_modules/**', '**/node_modules/**', 'dist/**'],
    testTimeout: 60000,
    hookTimeout: 60000,
    setupFiles: ['./src/tests/setup.ts'],
  },
});
