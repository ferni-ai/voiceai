/**
 * First-paint checks (tests/first-paint): what a signed-out visitor sees in the
 * first seconds, frame by frame, on the production build.
 *
 *   pnpm exec playwright test -c playwright.first-paint.config.ts
 *
 * Chromium only, phone and desktop. FIRST_PAINT_PORT picks the preview port.
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.FIRST_PAINT_PORT ?? 3047);
const OUT_DIR = 'node_modules/.cache/first-paint';

export default defineConfig({
  testDir: './tests/first-paint',
  fullyParallel: false, // frame timing: one page at a time
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    reducedMotion: 'no-preference',
    serviceWorkers: 'block', // every run is a cold first visit
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'phone',
      use: {
        ...devices['Pixel 7'],
        defaultBrowserType: 'chromium',
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `pnpm exec vite build --outDir ${OUT_DIR} && pnpm exec vite preview --outDir ${OUT_DIR} --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
