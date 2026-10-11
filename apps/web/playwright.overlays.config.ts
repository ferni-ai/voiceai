/**
 * Overlay gallery checks: visual snapshots, WCAG contrast (axe) and toast
 * geometry over the dev-only overlay gallery (src/ui/dev-panel/overlay-gallery.ts).
 *
 *   pnpm exec playwright test -c playwright.overlays.config.ts
 *
 * Chromium only, two viewports. The gallery exists only in development builds,
 * so this serves a development-mode bundle rather than the production build.
 * Snapshots are per platform; CI (Linux) writes missing ones and uploads them
 * (see the overlay-gallery job in .github/workflows/ci.yml).
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = 3044;
const OUT_DIR = 'node_modules/.cache/overlay-gallery';

export default defineConfig({
  testDir: './tests/overlays',
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{projectName}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
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
      use: {
        ...devices['iPhone 13'],
        defaultBrowserType: 'chromium',
        deviceScaleFactor: 1,
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    // A development-mode bundle (import.meta.env.DEV stays true, so the gallery
    // is in it) served by vite preview: pages boot from a few chunks instead of
    // hundreds of on-demand dev modules, which is most of the CI time.
    command: `NODE_ENV=development pnpm exec vite build --mode development --outDir ${OUT_DIR} && pnpm exec vite preview --outDir ${OUT_DIR} --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
