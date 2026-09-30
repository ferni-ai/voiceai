/**
 * Shared Playwright fixtures for the web app E2E suite.
 *
 * The app needs a signed-in user and the UI server (port 3002) to get past the
 * sign-in gate and load its data. These fixtures make every test self-contained:
 *
 * - A dev auth user is seeded in localStorage (read only in development builds
 *   when Firebase isn't configured, see src/services/dev-auth-user.ts).
 * - Backend routes the Vite dev server would proxy to the UI server are
 *   answered with page.route, so nothing leaves the machine.
 * - GSAP, normally loaded from cdnjs, is served from node_modules.
 *
 * Tests can override any route by calling page.route again: the most recently
 * registered handler wins.
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { test as base, expect, type Page, type Route } from '@playwright/test';

export { expect };

export const DEV_AUTH_USER = { uid: 'e2e-user', displayName: 'Sam', email: 'sam@example.com' };

export const MOCK_AGENTS = [
  {
    id: 'ferni',
    name: 'Ferni',
    initials: 'F',
    subtitle: 'Your personal guide',
    role: 'coach',
    roleId: 'ferni',
    isCoordinator: true,
    canHandoff: true,
    handoffToolName: 'handoffToFerni',
    themeClass: 'persona-ferni',
    voiceId: 'ferni-voice',
  },
  {
    id: 'maya-santos',
    name: 'Maya Santos',
    initials: 'MS',
    subtitle: 'Habits coach',
    role: 'team',
    roleId: 'maya-santos',
    isCoordinator: false,
    canHandoff: true,
    handoffToolName: 'handoffToMaya',
    themeClass: 'persona-maya-santos',
    voiceId: 'maya-voice',
  },
];

/** Backend paths the Vite dev server proxies to the UI server. */
const BACKEND_ROUTE =
  /^https?:\/\/[^/]+\/(api|token|subscription|spotify|wearables|health)(\/|\?|$)/;

const gsapSource = (() => {
  try {
    const require = createRequire(import.meta.url);
    return readFileSync(require.resolve('gsap/dist/gsap.min.js'), 'utf8');
  } catch {
    return null;
  }
})();

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Answer backend calls locally so the app runs without the UI server. */
export async function mockBackend(page: Page): Promise<void> {
  await page.route(BACKEND_ROUTE, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/agents') {
      return fulfillJson(route, {
        agents: MOCK_AGENTS,
        count: MOCK_AGENTS.length,
        timestamp: new Date().toISOString(),
      });
    }
    // Anything else behaves like an endpoint this backend doesn't offer, which
    // the app must tolerate.
    return fulfillJson(route, { error: 'Not found' }, 404);
  });

  if (gsapSource) {
    await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/gsap\//, (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: gsapSource })
    );
  }
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((user) => {
      try {
        localStorage.setItem('ferni_dev_auth_user', JSON.stringify(user));
      } catch {
        // Storage can be unavailable (e.g. opaque origins); the gate will show.
      }
    }, DEV_AUTH_USER);
    await mockBackend(page);
    await use(page);
  },
});
