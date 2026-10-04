/**
 * Web → UI-server route contract.
 *
 * Reads the web modules that talk to integrations, Spotify, vibe, calendar,
 * your-story and life-automation endpoints, extracts every request they make
 * (apiGet/apiPost/apiPut/apiDelete calls, fetch calls and window.location
 * navigations), and dispatches each one, with its HTTP method, into the REAL
 * route handler the UI server mounts for that prefix. A call is served only if
 * that handler claims it (returns true). Unmatched routes return false, which
 * the server turns into a 404.
 *
 * Guards against vacuity:
 * - each handler must reject a bogus path under its prefix (negative control);
 * - every api* call site in a file must be extracted, so a call the
 *   extractor can't read fails the test instead of being skipped;
 * - each handler must actually be dispatched by src/servers/api/index.ts.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Readable } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { describe, expect, it, vi } from 'vitest';

// The Ecobee router answers 503 for every path when the app-level key is unset;
// set one so routing (not configuration) is what's under test.
vi.hoisted(() => {
  process.env.ECOBEE_API_KEY = process.env.ECOBEE_API_KEY || 'contract-test-key';
});

vi.mock('../../../../api/auth-middleware.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../api/auth-middleware.js')>();
  const ctx = {
    userId: 'contract-user',
    isAdmin: false,
    isDevMode: false,
    authMethod: 'firebase' as const,
  };
  return {
    ...actual,
    requireAuth: vi.fn(async () => ctx),
    optionalAuthAsync: vi.fn(async () => ctx),
    rateLimit: vi.fn(() => false),
  };
});

const ROOT = resolve(__dirname, '../../../../..');
const WEB = resolve(ROOT, 'apps/web/src');

/** Web modules whose requests must all be served. */
const WEB_FILES = [
  'services/biometrics.service.ts',
  'services/banking.service.ts',
  'services/life-automation.service.ts',
  // app/integrations-callbacks.ts makes no direct API calls any more: its connect
  // actions go through services/oauth-connect.service.ts (POST /auth/oauth/start),
  // covered by oauth-connect-sites and oauth-connect-identity tests.
  'app/panel-methods.ts',
  'ui/integrations-settings.ui.ts',
  'ui/connected-life.ui.ts',
  'ui/vibe-controller.ui.ts',
  'ui/vibe-controller.api.ts',
];

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
) => Promise<boolean>;

interface Router {
  prefix: string;
  /** Name the server (or the v1 router) dispatches. */
  mountedAs: string;
  load: () => Promise<Handler>;
}

/** Mirrors the prefix dispatch in src/servers/api/index.ts. */
const ROUTERS: Router[] = [
  {
    prefix: '/api/v1',
    mountedAs: 'handleV1Routes',
    load: async () => (await import('../../../../api/v1/index.js')).handleV1Routes,
  },
  {
    prefix: '/wearables',
    mountedAs: 'handleWearablesRoutes',
    load: async () => (await import('../wearables.js')).handleWearablesRoutes,
  },
  {
    prefix: '/spotify',
    mountedAs: 'handleSpotifyRoutes',
    load: async () => (await import('../spotify.js')).handleSpotifyRoutes,
  },
  {
    prefix: '/auth/google',
    mountedAs: 'handleGoogleCalendarRoutes',
    load: async () => (await import('../google-calendar.js')).handleGoogleCalendarRoutes,
  },
  {
    prefix: '/api/vibe',
    mountedAs: 'handleVibeRoutes',
    load: async () => {
      const { handleVibeRoutes } = await import('../vibe.js');
      return (req, res, pathname) => handleVibeRoutes(req, res, pathname);
    },
  },
  {
    prefix: '/api/ecobee',
    mountedAs: 'handleEcobeeRoutes',
    load: async () => (await import('../ecobee.js')).handleEcobeeRoutes,
  },
  {
    prefix: '/api/calendar',
    mountedAs: 'handleCalendarRoutes',
    load: async () =>
      (await import('../../../../api/calendar-routes/index.js')).handleCalendarRoutes,
  },
  {
    prefix: '/api/your-story',
    mountedAs: 'handleYourStoryRoutes',
    load: async () => (await import('../../../../api/your-story-routes.js')).handleYourStoryRoutes,
  },
  {
    prefix: '/api/predictions',
    mountedAs: 'handlePredictionsRoutes',
    load: async () =>
      (await import('../../../../api/routes/predictions.js')).handlePredictionsRoutes,
  },
  {
    // GET /api/huddles/:id claims any one-segment path, so scope the
    // negative control to the start route's own prefix.
    prefix: '/api/huddles/start',
    mountedAs: 'handleEngagementRoutes',
    load: async () => (await import('../../../../api/engagement-routes.js')).handleEngagementRoutes,
  },
  // Conversation history, analytics and memories (#253) are engagement routes too.
  ...['/api/conversations', '/api/analytics/user', '/api/cognitive/memories'].map((prefix) => ({
    prefix,
    mountedAs: 'handleEngagementRoutes',
    load: async () => (await import('../../../../api/engagement-routes.js')).handleEngagementRoutes,
  })),
  {
    prefix: '/api/life-automation',
    mountedAs: 'handleLifeAutomationRoutes',
    load: async () =>
      (await import('../../../../api/life-automation-routes.js')).handleLifeAutomationRoutes,
  },
];

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

interface WebCall {
  file: string;
  method: string;
  path: string;
}

/** Sample values for template expressions that aren't string constants. */
const SAMPLES: Record<string, string> = { provider: 'oura', platform: 'oura' };

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function resolveTemplate(raw: string, src: string): string {
  return raw.replace(/\$\{([^}]+)\}/g, (_m, expr: string) => {
    const name = expr.trim().replace(/^this\./, '');
    const constant = new RegExp(`\\b${name}\\s*=\\s*'([^']+)'`).exec(src);
    if (constant) return constant[1];
    const sampleKey = Object.keys(SAMPLES).find((k) => name === k);
    return sampleKey ? SAMPLES[sampleKey] : 'x';
  });
}

const API_CALL = /\bapi(Get|Post|Put|Delete)\s*(?:<[\s\S]*?>)?\s*\(\s*(['`])([\s\S]*?)\2/g;
const NAVIGATION = /window\.location\.href\s*=\s*(['`])([\s\S]*?)\1/g;
const FETCH = /\bfetch\(\s*(['`])([\s\S]*?)\1/g;
const API_CALL_SITES = /\bapi(Get|Post|Put|Delete)\s*[<(]/g;

function extractCalls(file: string): {
  calls: WebCall[];
  apiCallSites: number;
  apiCallsParsed: number;
} {
  const src = stripComments(readFileSync(resolve(WEB, file), 'utf8'));
  const calls: WebCall[] = [];
  const add = (method: string, raw: string): void => {
    calls.push({ file, method, path: resolveTemplate(raw, src).split('?')[0] });
  };
  const apiMatches = [...src.matchAll(API_CALL)];
  for (const m of apiMatches) add(m[1].toUpperCase(), m[3]);
  for (const m of src.matchAll(NAVIGATION)) add('GET', m[2]);
  for (const m of src.matchAll(FETCH)) add('GET', m[2]);
  return {
    // Navigations to external sites (e.g. OAuth providers) aren't ours to check.
    // ('/' is a reload of the app shell, served statically.)
    calls: calls.filter((c) => c.path.startsWith('/') && c.path !== '/'),
    apiCallSites: [...src.matchAll(API_CALL_SITES)].length,
    apiCallsParsed: apiMatches.filter((m) => resolveTemplate(m[3], src).startsWith('/')).length,
  };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/** Mirrors apps/web/src/utils/api.ts: userId in the query for GET/DELETE, in the body otherwise. */
function fakeRequest(method: string, path: string): IncomingMessage {
  const hasBody = method !== 'GET' && method !== 'DELETE';
  const body = hasBody ? [Buffer.from(JSON.stringify({ userId: 'contract-user' }))] : [];
  const req = Readable.from(body) as unknown as IncomingMessage;
  Object.assign(req, {
    method,
    url: hasBody ? path : `${path}?userId=contract-user`,
    headers: {
      host: 'localhost',
      authorization: 'Bearer contract-token',
      // What bindVerifiedIdentity sets for a verified token: routes read identity from here.
      'x-firebase-uid': 'contract-user',
      'content-type': 'application/json',
    },
    socket: { remoteAddress: '127.0.0.1' },
    connection: { remoteAddress: '127.0.0.1' },
  });
  return req;
}

function fakeResponse(): ServerResponse & { status: number } {
  const headers = new Map<string, unknown>();
  const res = {
    status: 0,
    headersSent: false,
    statusCode: 200,
    setHeader: (k: string, v: unknown) => headers.set(k.toLowerCase(), v),
    getHeader: (k: string) => headers.get(k.toLowerCase()),
    removeHeader: (k: string) => headers.delete(k.toLowerCase()),
    writeHead(code: number) {
      this.status = code;
      this.statusCode = code;
      this.headersSent = true;
      return this;
    },
    write: () => true,
    end() {
      if (!this.status) this.status = this.statusCode;
      this.headersSent = true;
      return this;
    },
    on: () => res,
    once: () => res,
  };
  return res as unknown as ServerResponse & { status: number };
}

function routerFor(path: string): Router | undefined {
  return ROUTERS.filter((r) => path === r.prefix || path.startsWith(`${r.prefix}/`)).sort(
    (a, b) => b.prefix.length - a.prefix.length
  )[0];
}

async function isServed(method: string, path: string): Promise<boolean> {
  const router = routerFor(path);
  if (!router) return false;
  const handler = await router.load();
  const req = fakeRequest(method, path);
  return handler(req, fakeResponse(), path, new URL(req.url ?? path, 'http://localhost'));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('web → UI server route contract', () => {
  const serverIndex = readFileSync(resolve(ROOT, 'src/servers/api/index.ts'), 'utf8');

  it.each(ROUTERS.map((r) => [r.prefix, r] as const))(
    '%s handler is mounted by the UI server and rejects unknown paths',
    async (_prefix, router) => {
      expect(serverIndex).toContain(`${router.mountedAs}(req, res, pathname`);
      expect(await isServed('GET', `${router.prefix}/__no_such_route__`)).toBe(false);
    }
  );

  it.each(WEB_FILES)('%s: every api call site is extracted with a literal path', (file) => {
    const { calls, apiCallSites, apiCallsParsed } = extractCalls(file);
    expect(calls.length).toBeGreaterThan(0);
    expect(apiCallsParsed).toBe(apiCallSites);
  });

  it('every request the web modules make is served by a mounted handler', async () => {
    const calls = WEB_FILES.flatMap((f) => extractCalls(f).calls);
    expect(calls.length).toBeGreaterThan(20);

    const unserved: string[] = [];
    for (const call of calls) {
      if (!(await isServed(call.method, call.path))) {
        unserved.push(`${call.file}: ${call.method} ${call.path}`);
      }
    }
    expect(unserved).toEqual([]);
  }, 60000);
});
