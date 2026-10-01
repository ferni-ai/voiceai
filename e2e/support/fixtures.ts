/**
 * Shared Playwright fixtures for the root E2E suite.
 *
 * Every spec imports `test`/`expect` from here instead of '@playwright/test'.
 * The fixtures give each test:
 *
 * - A network guard. Any browser request, WebSocket or APIRequestContext call
 *   to a non-localhost host fails the test (unless the run sets
 *   E2E_ALLOW_REMOTE=1). The few third-party scripts and stylesheets the app
 *   pulls in on load (GSAP, Google Fonts, Google Identity, Spotify SDK) are
 *   answered locally so they never leave the machine either.
 * - Optionally (the `offline` project), a mocked backend: everything the Vite
 *   dev server would proxy to the UI server (/api, /token, /subscription, ...)
 *   is answered with context.route. Tests override any of it with page.route,
 *   which takes precedence over context routes.
 * - A dev-only stand-in user in localStorage (`ferni_dev_auth_user`, read only
 *   when `import.meta.env.DEV`, see apps/web/src/services/dev-auth-user.ts) so
 *   the app gets past the sign-in gate without Firebase.
 *
 * Pattern ported from apps/web/tests/e2e/fixtures.ts.
 */

import { appendFileSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import {
  test as base,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type Route,
} from '@playwright/test';
import { LANDING_URL, REMOTE_ALLOWED, assertAllowedTarget, isLocalUrl } from './env';

export { expect };
export type { Page };

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

/** Backend paths the Vite dev server proxies to the UI server (see apps/web/vite.config.ts). */
const BACKEND_PATH =
  /^\/(api|token|token-url|demo-token|subscription|spotify|wearables|auth|calendar|usage|health)(\/|$)/;

/** Local backend calls only: a remote host is left to the network guard. */
const isBackendRoute = (url: URL): boolean => isLocalUrl(url) && BACKEND_PATH.test(url.pathname);

// ---------------------------------------------------------------------------
// Local stand-ins for third-party assets the app loads from its HTML
// ---------------------------------------------------------------------------

const gsapSource = (() => {
  try {
    const require = createRequire(import.meta.url);
    const appRequire = createRequire(require.resolve('../../apps/web/package.json'));
    return readFileSync(appRequire.resolve('gsap/dist/gsap.min.js'), 'utf8');
  } catch {
    return null;
  }
})();

interface LocalStub {
  readonly contentType: string;
  readonly body: string;
}

/**
 * Third-party URLs the app requests on load, answered locally. Anything not
 * listed here that points off-machine fails the test.
 */
function localStubFor(url: URL): LocalStub | null {
  const host = url.hostname;
  if (host === 'cdnjs.cloudflare.com' && url.pathname.includes('/gsap/') && gsapSource) {
    return { contentType: 'application/javascript', body: gsapSource };
  }
  if (host === 'fonts.googleapis.com') {
    // System fonts are fine for tests.
    return { contentType: 'text/css', body: '/* fonts stubbed for offline e2e */' };
  }
  if (host === 'accounts.google.com' && url.pathname.startsWith('/gsi/client')) {
    // Google Identity Services: absent `window.google`, the app skips One Tap.
    return { contentType: 'application/javascript', body: '/* gsi stubbed for offline e2e */' };
  }
  if (host === 'sdk.scdn.co' && url.pathname === '/spotify-player.js') {
    return { contentType: 'application/javascript', body: '/* spotify sdk stubbed for offline e2e */' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Network guard
// ---------------------------------------------------------------------------

/**
 * With E2E_NETWORK_LOG=<file>, append one line per non-local browser request
 * the guard intercepted ("stubbed" = answered locally, "blocked" = aborted and
 * failed the test). Useful to audit a run.
 */
function logNonLocal(outcome: 'stubbed' | 'blocked', url: string): void {
  const file = process.env.E2E_NETWORK_LOG;
  if (!file) return;
  try {
    appendFileSync(file, `${outcome} ${url}\n`);
  } catch {
    // Logging is best effort.
  }
}

/** Non-local traffic seen during one test. */
class NetworkGuard {
  readonly violations: string[] = [];

  record(kind: string, url: string): void {
    this.violations.push(`${kind} ${url}`);
  }

  async install(context: BrowserContext): Promise<void> {
    if (REMOTE_ALLOWED) return;

    // Catch-all for every non-local request. page.route handlers registered by
    // the fixtures or by tests run first; whatever they pass on ends up here.
    await context.route(
      (url) => !isLocalUrl(url),
      (route: Route) => {
        const url = new URL(route.request().url());
        const stub = localStubFor(url);
        if (stub) {
          logNonLocal('stubbed', url.href);
          return route.fulfill({ status: 200, contentType: stub.contentType, body: stub.body });
        }
        logNonLocal('blocked', url.href);
        this.record(route.request().method(), url.href);
        return route.abort('blockedbyclient');
      }
    );

    await context.routeWebSocket(
      (url) => !isLocalUrl(url),
      (ws) => {
        logNonLocal('blocked', ws.url());
        this.record('WS', ws.url());
        return ws.close();
      }
    );

    // Belt and braces: a response that came from a real, non-loopback server
    // address means something slipped past the routes above.
    context.on('response', (response) => {
      void response
        .serverAddr()
        .then((addr) => {
          if (addr && !isLocalUrl(`http://${addr.ipAddress.includes(':') ? `[${addr.ipAddress}]` : addr.ipAddress}`)) {
            this.record(`ESCAPED(${addr.ipAddress})`, response.url());
          }
        })
        .catch(() => undefined);
    });
  }

  assertClean(): void {
    if (this.violations.length === 0) return;
    const unique = [...new Set(this.violations)];
    throw new Error(
      `[e2e network guard] ${unique.length} request(s) tried to leave localhost:\n  ` +
        unique.join('\n  ') +
        '\nMock the route (page.route) or add a local stub in e2e/support/fixtures.ts.'
    );
  }
}

/** Wrap an APIRequestContext so every call is checked against the localhost guard. */
function guardRequestContext(request: APIRequestContext, baseURL: string | undefined): APIRequestContext {
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'fetch']);
  return new Proxy(request, {
    get(targetObj, prop, receiver) {
      const value = Reflect.get(targetObj, prop, receiver) as unknown;
      if (typeof prop !== 'string' || !methods.has(prop) || typeof value !== 'function') {
        return value;
      }
      return (urlOrRequest: unknown, ...rest: unknown[]) => {
        if (typeof urlOrRequest === 'string') {
          const absolute = new URL(urlOrRequest, baseURL ?? 'http://localhost').href;
          assertAllowedTarget(absolute, 'request URL');
        }
        return (value as (...args: unknown[]) => unknown).call(targetObj, urlOrRequest, ...rest);
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Mocked backend
// ---------------------------------------------------------------------------

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/**
 * Answer backend calls locally so the app runs without the UI server.
 * Installed on the browser context, so it also covers popups and workers;
 * page.route handlers registered by tests take precedence over it.
 */
export async function mockBackend(target: Page | BrowserContext): Promise<void> {
  await target.route(isBackendRoute, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/agents') {
      return fulfillJson(route, {
        agents: MOCK_AGENTS,
        count: MOCK_AGENTS.length,
        timestamp: new Date().toISOString(),
      });
    }
    if (url.pathname === '/health') {
      return fulfillJson(route, { status: 'ok' });
    }
    // Anything else behaves like an endpoint this backend doesn't offer, which
    // the app must tolerate.
    return fulfillJson(route, { error: 'Not found' }, 404);
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface E2EOptions {
  /** Answer UI-server routes with context.route (the offline project). */
  mockBackend: boolean;
  /** Seed the dev-only stand-in user so the app skips the sign-in gate. */
  seedDevAuthUser: boolean;
}

interface E2EFixtures {
  /** Skips @needs-landing tests when no landing site URL is configured. */
  landingTarget: void;
  networkGuard: NetworkGuard;
  /**
   * For tests that create their own contexts with browser.newContext():
   * applies the same guard, mocks and dev user as the default context.
   */
  prepareContext: (context: BrowserContext) => Promise<BrowserContext>;
}

export const test = base.extend<E2EOptions & E2EFixtures>({
  mockBackend: [false, { option: true }],
  seedDevAuthUser: [true, { option: true }],

  landingTarget: [
    async ({}, use, testInfo) => {
      testInfo.skip(
        testInfo.tags.includes('@needs-landing') && !LANDING_URL,
        'Set E2E_LANDING_URL to run the marketing site tests'
      );
      await use();
    },
    { auto: true },
  ],

  networkGuard: async ({}, use) => {
    const guard = new NetworkGuard();
    await use(guard);
    guard.assertClean();
  },

  prepareContext: async ({ networkGuard, mockBackend: shouldMock, seedDevAuthUser }, use) => {
    await use(async (context) => {
      await networkGuard.install(context);
      if (shouldMock) await mockBackend(context);
      if (seedDevAuthUser) {
        await context.addInitScript((user) => {
          try {
            localStorage.setItem('ferni_dev_auth_user', JSON.stringify(user));
          } catch {
            // Storage can be unavailable (e.g. opaque origins); the gate will show.
          }
        }, DEV_AUTH_USER);
      }
      return context;
    });
  },

  context: async ({ context, prepareContext }, use) => {
    await prepareContext(context);
    await use(context);
  },

  request: async ({ request, baseURL }, use) => {
    await use(guardRequestContext(request, baseURL));
  },
});
