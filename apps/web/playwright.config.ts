/**
 * Playwright E2E Test Configuration for Ferni Frontend
 *
 * Runs E2E tests against the Vite dev server or production build.
 * Tests cover: connection flows, handoffs, subscription, marketplace, etc.
 */

import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
/**
 * Port the app is served on. Not the dev port (3004), so a local run never
 * reuses a developer's dev server, whose proxy reaches their real UI server.
 * Override with PLAYWRIGHT_PORT.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3014);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  /*
   * Only *.spec.ts files are Playwright tests. The *.test.ts files in this
   * folder are Vitest suites (they import from 'vitest') and run via `pnpm test`.
   */
  testMatch: '**/*.spec.ts',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html', { open: 'never' }], ['list']],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: BASE_URL,

    /*
     * The app registers a service worker; requests it makes bypass page.route,
     * so mocked backend calls would intermittently hit the real network.
     */
    serviceWorkers: 'block',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Optional: point at a preinstalled Chromium when the bundled revision isn't downloaded.
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined },
      },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: `node scripts/ensure-design-system.mjs && npx vite --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    // No backend proxy: tests mock the backend in the page (tests/e2e/fixtures.ts),
    // and a request that outlives its page gets a local 404 instead of reaching
    // a UI server on 3002.
    env: { FERNI_E2E_OFFLINE: '1' },
  },

  /* Global test timeout */
  timeout: 30 * 1000,

  /* Expect timeout */
  expect: {
    timeout: 5000,
  },
});
