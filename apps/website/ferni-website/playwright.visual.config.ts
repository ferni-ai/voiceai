import { defineConfig } from '@playwright/test';

/**
 * Screenshot comparison of the built ferni.ai site against approved images
 * (e2e/website-visual.spec.ts). It runs only inside the pinned Playwright
 * image, where Chromium and the fonts match the images; the spec's header
 * says how to run it and how to update the images.
 */
export default defineConfig({
  testDir: '../../../e2e',
  testMatch: ['website-visual.spec.ts'],
  snapshotPathTemplate: '{testDir}/__screenshots__/website-visual/{arg}{ext}',
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  // About one shot in 300 rasterizes a synthetic italic line a pixel wider
  // (seen twice on /compare/'s quote across ~1,000 shots). A retry absorbs
  // that; a real change fails both tries, and the report lists any flaky test.
  retries: 1,
  workers: 4,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      // Per-pixel colour tolerance. The default 0.2 lets a card go from
      // #2a241f to #3a2a1f unnoticed; 0.02 catches it, and any shift of about
      // 10 steps of red, 8 of green or 16 of blue. 0.01 drifts by up to 4,000
      // pixels between runs of the same build.
      threshold: 0.02,
      // Text antialiasing drifts now and then: in 320 shots with no
      // allowance, 5 differed, by 6 to 120 pixels (130 seen once). A real
      // change moves thousands.
      maxDiffPixels: 300,
    },
  },
  // One server for every worker: a server per worker, as the other website
  // specs start, is stopped by the first worker to finish.
  webServer: {
    command: 'python3 -m http.server 8770 --bind 127.0.0.1 --directory _site',
    url: 'http://127.0.0.1:8770/',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    browserName: 'chromium',
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
  },
});
