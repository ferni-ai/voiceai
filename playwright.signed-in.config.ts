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
  retries: 0,
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
