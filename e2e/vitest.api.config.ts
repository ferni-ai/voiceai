/**
 * Vitest config for the two API suites in e2e/ that are written for Vitest,
 * not Playwright (the Playwright config ignores them). Both call the UI server
 * at E2E_API_URL (default http://localhost:3002), behind the same localhost
 * guard as the Playwright suites (see support/env.ts).
 *
 * Run: pnpm test:e2e:server:vitest   (needs `pnpm ui-server`)
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: __dirname,
    include: ['predictive-outreach.spec.ts', 'intelligent-outreach.e2e.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
});
