import { defineConfig, devices } from '@playwright/test';

/**
 * Signed-in e2e suite: runs against the local stack started by
 * scripts/e2e/start-signed-in-stack.sh (Firebase emulators + API + Vite dev).
 *
 *   E2E_BASE_URL=http://localhost:3004 npx playwright test -c playwright.signed-in.config.ts
 */
export default defineConfig({
  testDir: './e2e/signed-in',
  fullyParallel: false, // one emulator-backed stack; keep panels from fighting over it
  workers: 1,
  // One retry on CI: ~1.5-3% of specs flake on the shared emulator stack (menu-e2e
  // 2/130 groups, signed-in nightly 3/8 runs). A retried pass is reported "flaky", not
  // "passed", so it stays visible; playwright.menu-e2e.config.ts inherits this and its
  // no-skips guard still fails the gate on any non-"expected" result.
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-signed-in', open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3004',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
});
