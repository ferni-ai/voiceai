/**
 * Production smoke tests against a deployed URL (TEST_URL). No local server.
 * Used by .github/workflows/e2e-tests.yml after deploys; PRs run the offline
 * suite with playwright.config.ts instead.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/smoke',
  testMatch: '**/*.spec.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['github']],
  use: {
    baseURL: process.env.TEST_URL || 'https://ferni-prod.web.app',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
