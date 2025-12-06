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
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
    setupFiles: ['./src/tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
