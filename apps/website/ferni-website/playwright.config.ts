import { defineConfig } from '@playwright/test';

/**
 * Checks the built ferni.ai site (apps/website/ferni-website/_site) before a
 * landing deploy. Run from the repo root:
 *   pnpm playwright test -c apps/website/ferni-website/playwright.config.ts
 * The specs serve _site themselves, so no web server is configured here.
 */
export default defineConfig({
  testDir: '../../../e2e',
  testMatch: ['night-ink-website.spec.ts', 'website-dark-contrast.spec.ts', 'website-consent.spec.ts', 'website-what-ferni-is.spec.ts'],
  forbidOnly: !!process.env.CI,
  workers: 2,
  reporter: 'line',
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
