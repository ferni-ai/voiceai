import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Exclude frontend directories - they have their own vitest configs with jsdom
    // Exclude design-system and e2e - they use Playwright, not Vitest
    exclude: [
      'node_modules/**',
      '**/node_modules/**',
      'dist/**',
      'frontend-orb/**',
      'apps/web/**',
      'design-system/**',
      'apps/**',
      'e2e/**',
      // E2E integration tests require real API credentials - run manually
      'src/tests/integration/**',
      // Gemini E2E tests hit real APIs and are flaky (rate limits, LLM non-determinism)
      // Run manually: pnpm vitest run src/tests/e2e/gemini-integration/
      'src/tests/e2e/gemini-integration/**',
      // Integration tests (*.integration.test.ts) require real API keys - run manually
      '**/*.integration.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/index.ts',
        'src/tests/helpers/**',
        'frontend-orb/**',
        'apps/web/**',
      ],
      // Coverage thresholds - Current actual coverage (Dec 2024)
      // Actual: lines=39.45%, functions=42.32%, branches=32.25%, statements=38.92%
      // Phase 3 added 98 new tests but 60% target requires significant additional work
      // Set thresholds slightly below current to prevent regressions
      thresholds: {
        lines: 38,
        functions: 41,
        branches: 31,
        statements: 38,
      },
    },
    setupFiles: ['./src/tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
