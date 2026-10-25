/**
 * Vitest Configuration - E2E Tests
 *
 * End-to-end tests that verify complete user flows.
 * May require external services (Firestore emulator, etc).
 * Run selectively based on what's being tested.
 *
 * Usage:
 *   pnpm test:e2e           # All e2e tests (with mocked services)
 *   pnpm test:e2e:firestore # Firestore tests (needs emulator)
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      // E2E test patterns
      '**/*.e2e.test.ts',
      '**/e2e/**/*.test.ts',
    ],
    exclude: [
      'node_modules/**',
      '**/node_modules/**',
      'dist/**',
      // Agent worktrees nest full, stale repo copies under .claude/worktrees/: never run them
      '.claude/**',
      '**/.claude/**',
      'apps/**',
      'design-system/**',
      // Playwright tests are separate
      'e2e/**',
      // Gemini tests need real API
      'src/tests/e2e/gemini-integration/**',
    ],
    testTimeout: 60000, // Longer timeout for e2e
    hookTimeout: 60000,
    // Writes the gitignored flag barrel and env-name list (src/config/generated-lists.ts).
    globalSetup: ['./src/config/__tests__/generate-lists-setup.ts'],
    setupFiles: ['./src/tests/setup.ts'],
  },
});
