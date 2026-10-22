import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    globals: true,
    // CLI commands build Firestore clients; no test may reach real Google Cloud.
    setupFiles: ['../../src/tests/gcp-guard-setup.ts'],
  },
});
