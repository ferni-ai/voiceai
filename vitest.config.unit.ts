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
      // Exclude integration and e2e patterns
    ],
    exclude: [
      'node_modules/**',
      '**/node_modules/**',
      'dist/**',
      'apps/**',
      'e2e/**',
      'design-system/**',
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
