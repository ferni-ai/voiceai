/**
 * Every Firestore-emulator test: the files named *.emulator.test.ts.
 *
 * They need a running emulator and skip without FIRESTORE_EMULATOR_HOST, so the
 * unit config leaves them out (a skip there read as green while no test ran).
 * The "Emulator Tests" job in data-layer-e2e.yml runs this config against the
 * Firestore and Auth emulators and fails on any skip. A new emulator test needs
 * only the name; no workflow edit. The menu contract files are the exception:
 * menu-e2e.yml runs them (see exclude).
 *
 * Run: firebase emulators:start --only auth,firestore:ferni-dev --project demo-project
 *      FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *      GCLOUD_PROJECT=demo-project pnpm exec vitest run --config vitest.config.emulator.ts
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.emulator.test.{ts,mjs}'],
    exclude: [
      'node_modules/**',
      '**/node_modules/**',
      'dist/**',
      // Agent worktrees nest full, stale repo copies under .claude/worktrees/: never run them
      '.claude/**',
      '**/.claude/**',
      // Menu E2E's "Menu contracts (L1)" job runs these, with the same no-skip
      // guard; listed here so no test runs in two jobs. Keep in step with the
      // files=(...) line in menu-e2e.yml.
      'src/api/__tests__/menu-*.emulator.test.ts',
      'src/api/__tests__/account-delete-every-store.emulator.test.ts',
    ],
    // Writes the gitignored flag barrel and env-name list (src/config/generated-lists.ts).
    globalSetup: ['./src/config/__tests__/generate-lists-setup.ts'],
    setupFiles: ['./src/tests/setup.ts', './src/tests/setup-emulator.ts'],
    // One file at a time: they share one emulator and one project (setup.ts maps
    // every project id to the same test id), and some clear whole databases
    // between cases. In parallel, 7 tests in 6 files failed on each other's data.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
