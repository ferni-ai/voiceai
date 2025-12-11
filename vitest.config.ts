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
      'frontend-typescript/**',
      'design-system/**',
      'apps/**',
      'e2e/**',
      // E2E integration tests require real API credentials - run manually
      'src/tests/integrations/**',
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
        'frontend-typescript/**',
      ],
      // Coverage thresholds - stepped approach toward 60%
      // Current: ~32% lines, ~33% functions, ~32% statements, ~27% branches
      // Phase 1: Match current (baseline)
      // Phase 2: 40%
      // Phase 3: 50%
      // Phase 4: 60% (production readiness)
      thresholds: {
        lines: 32,
        functions: 33,
        branches: 26,
        statements: 32,
      },
    },
    setupFiles: ['./src/tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
