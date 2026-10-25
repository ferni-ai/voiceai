import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    globals: true,
    // CLI code imports src/, which needs the gitignored generated lists.
    globalSetup: ['../../src/config/__tests__/generate-lists-setup.ts'],
    // CLI commands build Firestore clients; no test may reach real Google Cloud.
    setupFiles: ['../../src/tests/gcp-guard-setup.ts'],
  },
});
