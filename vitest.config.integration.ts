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
      // Latency budgets for the optimisation stack (timing-sensitive, so queue only)
      'tests/performance/**/*.test.ts',
      // Not here on purpose: tests/integration/real-home drives real smart-home
      // devices (pnpm test:real-home), and tests/integration/marketplace-agents needs
      // agent bundles installed from another repo. Both are run by hand.
    ],
    exclude: [
      'node_modules/**',
      '**/node_modules/**',
      'dist/**',
      // Agent worktrees nest full, stale repo copies under .claude/worktrees/: never run them
      '.claude/**',
      '**/.claude/**',
      'apps/**',
      'e2e/**',
      'design-system/**',
      // Exclude e2e tests
      '**/*.e2e.test.ts',
      '**/e2e/**',
      // Exclude tests that need real external APIs
      'src/tests/integration/**',
      'src/tests/e2e/gemini-integration/**',
      // Runs in the unit config, so voice-eval-only changes test it too
      'src/tests/voice-eval/**',
      // Firestore tests need emulator
      '**/*firestore*.test.ts',
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ['./src/tests/setup.ts'],
  },
});
