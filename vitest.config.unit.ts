/**
 * Vitest Configuration - Unit Tests Only
 *
 * Fast unit tests that don't require external services.
 * Runs in ~30-60 seconds for a quick feedback loop.
 *
 * Usage: pnpm test:unit
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      // Unit tests in __tests__ directories
      'src/**/__tests__/**/*.test.ts',
      // Pure logic of the eval harnesses and ops scripts (scripts/**). They import no
      // services, so they run here rather than in the integration config.
      'scripts/**/__tests__/**/*.test.{ts,mjs}',
      'scripts/**/*.test.mjs',
      // Design-system build helpers (node:assert, no browser). design-system/tests is
      // Playwright and stays out (see #1375).
      'design-system/*.test.js',
      'design-system/lib/**/*.test.js',
      // Mocked smart-home flows; no devices or network.
      'tests/synthetic/**/*.test.ts',
      // apps/async has its own vitest.config.ts, but nothing in CI runs it.
      'apps/async/src/**/__tests__/**/*.test.ts',
    ],
    exclude: [
      'node_modules/**',
      '**/node_modules/**',
      'dist/**',
      // Frontend tests have their own config (apps/web/vitest.config.ts)
      // Run them with: pnpm test:frontend
      'apps/web/**',
      'apps/cli/**',
      'e2e/**',
      // Exclude integration tests (by naming convention)
      '**/*.integration.test.ts',
      '**/*.e2e.test.ts',
      '**/*-integration.test.ts',
      '**/*integration*.test.ts',
      '**/integration/**',
      '**/e2e/**',
      // Exclude tests that need Firestore
      '**/*firestore*.test.ts',
      '**/*firebase*.test.ts',
      // Exclude src/tests directory (mixed unit/integration)
      'src/tests/**',
    ],
    testTimeout: 20000, // Reasonable timeout for unit tests with mocking
    hookTimeout: 20000,
    setupFiles: ['./src/tests/setup.ts'],
  },
});
