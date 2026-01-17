/**
 * Vitest Configuration - Integration Tests
 *
 * Tests that verify component integration but don't need real external services.
 * Runs in ~2-5 minutes.
 *
 * Usage: pnpm test:integration
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      // Integration test patterns
      '**/*.integration.test.ts',
      // Tests in src/tests that aren't e2e
      'src/tests/**/*.test.ts',
    ],
    exclude: [
      'node_modules/**',
      '**/node_modules/**',
      'dist/**',
      'apps/**',
      'e2e/**',
      'design-system/**',
      // Exclude e2e tests
      '**/*.e2e.test.ts',
      '**/e2e/**',
      // Exclude tests that need real external APIs
      'src/tests/integration/**',
      'src/tests/e2e/gemini-integration/**',
      // Firestore tests need emulator
      '**/*firestore*.test.ts',
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ['./src/tests/setup.ts'],
  },
});
