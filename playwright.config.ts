import { defineConfig, devices, type Project } from '@playwright/test';
import { APP_URL, LANDING_URL, REMOTE_ALLOWED } from './e2e/support/env';

/**
 * Playwright E2E configuration for the root `e2e/` suite.
 *
 * Tests are grouped by what they need (see e2e/README.md):
 *
 * | Suite     | Tag              | Needs                                   | Script                  |
 * | --------- | ---------------- | --------------------------------------- | ----------------------- |
 * | offline   | (untagged)       | Vite only; backend mocked in the page   | pnpm test:e2e:offline   |
 * | server    | @needs-server    | UI server API on :3002 (`pnpm ui-server`) | pnpm test:e2e:server  |
 * | agent     | @needs-agent     | Voice agent HTTP port / LiveKit         | pnpm test:e2e:agent     |
 * | landing   | @needs-landing   | Marketing site at E2E_LANDING_URL       | pnpm test:e2e:landing   |
 *
 * Only the offline suite runs by default. Choose others with E2E_SUITES, e.g.
 * `E2E_SUITES=offline,server npx playwright test`. Every suite runs behind the
 * localhost guard in e2e/support (non-local targets need E2E_ALLOW_REMOTE=1).
 *
 * Browser: set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use a preinstalled Chromium
 * whose revision differs from the one this Playwright version pins.
 */

const SUITES = (process.env.E2E_SUITES ?? 'offline')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const NEEDS_TAGS = /@needs-server|@needs-agent|@needs-landing/;

/**
 * Network-level backstop for the request guard in e2e/support/fixtures.ts.
 * page.route never sees some connections the browser opens on its own
 * (speculative preconnects, DNS prefetch, background services), so point the
 * browser at a proxy on a closed local port: anything not addressed to
 * loopback fails on this machine instead of leaving it. Lifted with
 * E2E_ALLOW_REMOTE=1.
 *
 * Chromium gets the raw flag: it bypasses proxies for loopback by itself,
 * while Playwright's `proxy` option would force loopback through the proxy.
 */
const DEAD_PROXY = 'http://127.0.0.1:9';
const localOnlyNetwork = REMOTE_ALLOWED
  ? {}
  : { proxy: { server: DEAD_PROXY, bypass: 'localhost,127.0.0.1,[::1]' } };

const chromium = {
  ...devices['Desktop Chrome'],
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: [
      // A synthetic microphone/camera, so recording flows work headless.
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      ...(REMOTE_ALLOWED ? [] : [`--proxy-server=${DEAD_PROXY}`]),
    ],
  },
};

const otherBrowser = (device: string) => ({
  ...devices[device],
  launchOptions: { ...localOnlyNetwork },
  mockBackend: true,
});

const suiteProjects: Record<string, Project[]> = {
  offline: [
    { name: 'offline', grepInvert: NEEDS_TAGS, use: { ...chromium, mockBackend: true } },
    // Other engines are opt-in (their browsers are not always installed).
    ...(process.env.E2E_ALL_BROWSERS === '1'
      ? [
          { name: 'offline-firefox', grepInvert: NEEDS_TAGS, use: otherBrowser('Desktop Firefox') },
          { name: 'offline-webkit', grepInvert: NEEDS_TAGS, use: otherBrowser('Desktop Safari') },
          { name: 'offline-mobile-chrome', grepInvert: NEEDS_TAGS, use: otherBrowser('Pixel 5') },
          { name: 'offline-mobile-safari', grepInvert: NEEDS_TAGS, use: otherBrowser('iPhone 12') },
        ]
      : []),
  ],
  server: [{ name: 'server', grep: /@needs-server/, grepInvert: /@needs-agent|@needs-landing/, use: { ...chromium, mockBackend: false } }],
  agent: [{ name: 'agent', grep: /@needs-agent/, grepInvert: /@needs-landing/, use: { ...chromium, mockBackend: false } }],
  // Tests skip themselves when E2E_LANDING_URL is unset (see support/fixtures.ts).
  landing: [
    {
      name: 'landing',
      grep: /@needs-landing/,
      grepInvert: /@needs-server|@needs-agent/,
      use: { ...chromium, mockBackend: false, seedDevAuthUser: false, baseURL: LANDING_URL },
    },
  ],
};

const unknown = SUITES.filter((s) => !(s in suiteProjects));
if (unknown.length > 0) {
  throw new Error(`Unknown E2E_SUITES entry: ${unknown.join(', ')} (use offline, server, agent, landing)`);
}

const projects = SUITES.flatMap((s) => suiteProjects[s]);

// Start Vite only when the app target is the default local dev server.
const DEFAULT_APP_URL = 'http://localhost:5173';
const needsVite = APP_URL === DEFAULT_APP_URL && SUITES.some((s) => s !== 'landing');

export default defineConfig({
  testDir: './e2e',
  // Vitest suites live next to the Playwright specs; they are not Playwright tests.
  testIgnore: ['**/predictive-outreach.spec.ts', '**/*.e2e.ts', '**/support/**'],
  globalSetup: './e2e/global-setup.ts',
  // The Vite dev server serves the app unbundled (hundreds of modules per
  // page load), so tests that load the page two or three times need headroom.
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
  ],

  use: {
    baseURL: APP_URL,
    // Requests a service worker makes bypass page.route (and the network guard).
    serviceWorkers: 'block',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Recording every test's video costs a lot of CPU; opt in with E2E_VIDEO=1.
    video: process.env.E2E_VIDEO === '1' ? 'retain-on-failure' : 'off',
  },

  projects,

  webServer: needsVite
    ? {
        // ensure-design-system generates design-system/dist, which the app imports.
        command: 'cd apps/web && node scripts/ensure-design-system.mjs && npx vite --port 5173 --strictPort',
        url: DEFAULT_APP_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
        // Offline-only runs don't need the backend proxy: a request that
        // outlives its page then gets a local 404 instead of reaching a UI
        // server on 3002 (apps/web/vite.config.ts reads this).
        env: SUITES.every((suite) => suite === 'offline') ? { FERNI_E2E_OFFLINE: '1' } : {},
      }
    : undefined,
});
