import { defineConfig, devices, type Project } from '@playwright/test';
import { APP_URL } from './e2e/support/env';

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
 * | remote    | @remote          | A deployed site; opt-in only            | pnpm test:e2e:remote    |
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

const NEEDS_TAGS = /@needs-server|@needs-agent|@remote/;

const chromium = {
  ...devices['Desktop Chrome'],
  launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined },
};

const suiteProjects: Record<string, Project[]> = {
  offline: [
    { name: 'offline', grepInvert: NEEDS_TAGS, use: { ...chromium, mockBackend: true } },
    // Other engines are opt-in (their browsers are not always installed).
    ...(process.env.E2E_ALL_BROWSERS === '1'
      ? [
          { name: 'offline-firefox', grepInvert: NEEDS_TAGS, use: { ...devices['Desktop Firefox'], mockBackend: true } },
          { name: 'offline-webkit', grepInvert: NEEDS_TAGS, use: { ...devices['Desktop Safari'], mockBackend: true } },
          { name: 'offline-mobile-chrome', grepInvert: NEEDS_TAGS, use: { ...devices['Pixel 5'], mockBackend: true } },
          { name: 'offline-mobile-safari', grepInvert: NEEDS_TAGS, use: { ...devices['iPhone 12'], mockBackend: true } },
        ]
      : []),
  ],
  server: [{ name: 'server', grep: /@needs-server/, grepInvert: /@needs-agent|@remote/, use: { ...chromium, mockBackend: false } }],
  agent: [{ name: 'agent', grep: /@needs-agent/, use: { ...chromium, mockBackend: false } }],
  remote: [{ name: 'remote', grep: /@remote/, use: { ...chromium, mockBackend: false } }],
};

const unknown = SUITES.filter((s) => !(s in suiteProjects));
if (unknown.length > 0) {
  throw new Error(`Unknown E2E_SUITES entry: ${unknown.join(', ')} (use offline, server, agent, remote)`);
}

const projects = SUITES.flatMap((s) => suiteProjects[s]);

// Start Vite only when the app target is the default local dev server.
const DEFAULT_APP_URL = 'http://localhost:5173';
const needsVite = APP_URL === DEFAULT_APP_URL && SUITES.some((s) => s !== 'remote');

export default defineConfig({
  testDir: './e2e',
  // Vitest suites live next to the Playwright specs; they are not Playwright tests.
  testIgnore: ['**/predictive-outreach.spec.ts', '**/*.e2e.ts', '**/support/**'],
  globalSetup: './e2e/global-setup.ts',
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
    video: 'retain-on-failure',
  },

  projects,

  webServer: needsVite
    ? {
        // ensure-design-system generates design-system/dist, which the app imports.
        command: 'cd apps/web && node scripts/ensure-design-system.mjs && npx vite --port 5173 --strictPort',
        url: DEFAULT_APP_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      }
    : undefined,
});
