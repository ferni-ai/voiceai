import { defineConfig } from '@playwright/test';

/**
 * Computed-style diff of the built site (_site) against the base build
 * (_site-base), and the dark-mode override audit
 * (e2e/website-style-diff.spec.ts). Run from the repo root:
 *   npx playwright test -c apps/website/ferni-website/playwright.style-diff.config.ts
 * The report lands in apps/website/ferni-website/style-diff-report/.
 */
export default defineConfig({
  testDir: '../../../e2e',
  testMatch: ['website-style-diff.spec.ts'],
  globalSetup: '../../../e2e/website-style-diff-report.ts',
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  retries: 1,
  workers: 4,
  // Six page loads and a stylesheet audit per test.
  timeout: 180_000,
  reporter: 'line',
  webServer: [
    {
      command: 'python3 -m http.server 8771 --bind 127.0.0.1 --directory _site-base',
      url: 'http://127.0.0.1:8771/',
      reuseExistingServer: !process.env.CI,
      stderr: 'ignore',
    },
    {
      command: 'python3 -m http.server 8772 --bind 127.0.0.1 --directory _site',
      url: 'http://127.0.0.1:8772/',
      reuseExistingServer: !process.env.CI,
      stderr: 'ignore',
    },
  ],
  use: {
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    timezoneId: 'UTC',
  },
});
