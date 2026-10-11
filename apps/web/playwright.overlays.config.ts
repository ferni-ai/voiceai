/**
 * Overlay gallery checks: visual snapshots, WCAG contrast (axe) and toast
 * geometry over the dev-only overlay gallery (src/ui/dev-panel/overlay-gallery.ts).
 *
 *   pnpm exec playwright test -c playwright.overlays.config.ts
 *
 * Chromium only, two viewports. The gallery exists only on the dev server, so
 * this starts Vite in dev mode rather than testing a production build.
 * Snapshots are per platform; CI (Linux) writes missing ones and uploads them
 * (see the overlay-gallery job in .github/workflows/ci.yml).
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = 3044;

export default defineConfig({
  testDir: './tests/overlays',
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{projectName}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 3 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  // Linux baselines are committed; any other platform writes its own locally.
  updateSnapshots: 'missing',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    reducedMotion: 'no-preference',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'phone',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', deviceScaleFactor: 1 },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
