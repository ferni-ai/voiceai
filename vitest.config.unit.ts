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
      // Frontend tests have their own config (apps/web/vitest.config.ts)
      // Run them with: pnpm test:frontend
      'apps/**',
      'e2e/**',
      'design-system/**',
      // *.integration.test.ts runs in vitest.config.integration.ts. Broader name
      // patterns ('*integration*', '*-integration', 'integration/**', '*.e2e.test.ts')
      // used to sit here too, and 40 mocked tests matched them and ran nowhere.
      '**/*.integration.test.ts',
      // src/api/__tests__/e2e needs the Firestore emulator (and skips without it).
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
