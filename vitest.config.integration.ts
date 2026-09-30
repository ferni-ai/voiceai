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
      '.claude/**',
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
    // No real services here (that's vitest.config.external.ts). With real
    // keys, key-gated tests switch to live Gemini/LiveKit calls and the CI
    // run stalled until its 30-minute timeout. Empty values keep them on
    // their offline path; dotenv won't override an existing variable.
    env: {
      GOOGLE_API_KEY: '',
      GEMINI_API_KEY: '',
      OPENAI_API_KEY: '',
      LIVEKIT_URL: '',
      LIVEKIT_API_KEY: '',
      LIVEKIT_API_SECRET: '',
    },
  },
});
