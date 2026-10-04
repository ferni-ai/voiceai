/**
 * Google Calendar has one connect path and one token store.
 *
 * Before: the integrations panel connected through /auth/google/*, whose
 * callback saved tokens in an encrypted per-user store, while every calendar
 * reader (calendar service, providers, webhooks, reminders, Gmail, and the v1
 * integrations status the panel shows) read a second, plaintext root
 * collection. A user who connected was invisible to every calendar feature,
 * and the v1 status reported a Promise (serialized `{}`) as "connected".
 *
 * Here the REAL web panel callback starts the flow; the REAL API routes
 * (bindVerifiedIdentity, POST /auth/oauth/start, /auth/google/login,
 * /auth/google/callback, /auth/google/unlink, /api/v1/integrations/*) run on
 * a real http server; Google's token endpoint, Firebase token verification,
 * the Google watch-channel API and Firestore (an in-memory fake keyed by
 * document path) are the only fakes. The browser's cookie jar is simulated.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

process.env.GOOGLE_CALENDAR_CLIENT_ID = 'g-id';
process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'g-secret';
process.env.OAUTH_ENCRYPTION_KEY = 'contract-test-key';

const TOKENS: Record<string, string> = { 'tok-user-A': 'user-A', 'tok-user-B': 'user-B' };
vi.mock('../../../../src/services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    TOKENS[token] ? { uid: TOKENS[token], claims: {}, isAnonymous: false } : null
  ),
}));
vi.mock('../../../../src/services/calendar/webhooks/google-webhook.js', () => ({
  createWatchChannel: vi.fn(async () => null),
  stopAllUserChannels: vi.fn(async () => undefined),
}));

/** Firestore, in memory: documents by full path. */
const firestoreDocs = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('@google-cloud/firestore', () => {
  const docRef = (path: string): Record<string, unknown> => ({
    get: async () => ({ exists: firestoreDocs.has(path), data: () => firestoreDocs.get(path) }),
    set: async (value: Record<string, unknown>, opts?: { merge?: boolean }) => {
      const prev = opts?.merge ? (firestoreDocs.get(path) ?? {}) : {};
      firestoreDocs.set(path, { ...prev, ...value });
    },
    delete: async () => void firestoreDocs.delete(path),
    collection: (name: string) => collectionRef(`${path}/${name}`),
  });
  const collectionRef = (path: string) => ({ doc: (id: string) => docRef(`${path}/${id}`) });
  /** A document's ref as Firestore shapes it: ref.parent (collection).parent (owner doc). */
  const refOf = (path: string) => {
    const seg = path.split('/');
    const owner =
      seg.length >= 4 ? { id: seg[seg.length - 3], parent: { id: seg[seg.length - 4] } } : null;
    return { id: seg[seg.length - 1], parent: { id: seg[seg.length - 2], parent: owner } };
  };
  return {
    FieldValue: class {},
    Firestore: class {
      collection(name: string) {
        return collectionRef(name);
      }
      collectionGroup(name: string) {
        return {
          get: async () => ({
            docs: [...firestoreDocs.keys()]
              .filter((path) => path.split('/').slice(-2, -1)[0] === name)
              .map((path) => ({ ref: refOf(path) })),
          }),
        };
      }
    },
  };
});

const signedInAs = vi.hoisted(() => ({ token: 'tok-user-A' }));
vi.mock('../../src/services/firebase-auth.service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getAuthToken: async () => signedInAs.token,
}));
vi.mock('../../src/ui/integrations-settings.ui.js', () => ({
  getIntegrationsSettingsUI: () => ({ show: vi.fn() }),
}));
const messageUI = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('../../src/ui/message.ui.js', () => ({ messageUI }));

const { bindVerifiedIdentity } = await import('../../../../src/servers/api/request-identity.js');
const { handleOAuthStartRoute } = await import('../../../../src/servers/api/routes/oauth-start.js');
const { handleGoogleCalendarRoutes } =
  await import('../../../../src/servers/api/routes/google-calendar.js');
const { handleIntegrationsRoutes } = await import('../../../../src/api/v1/integrations/handler.js');
const calendarOAuth = await import('../../../../src/services/identity/google-calendar-oauth.js');
const { createIntegrationsCallbacks } = await import('../../src/app/integrations-callbacks.js');

let http: Server;
let base = '';
const realFetch = globalThis.fetch;
const cookieJar = new Map<string, string>();
const mockLocation = { href: 'http://localhost:3000/', origin: 'http://localhost:3000' };

/** Browser-side fetch: same-origin requests go to the API server with cookies. */
async function browserFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(String(input), mockLocation.origin);
  if (url.origin !== mockLocation.origin) {
    // Google's token endpoint answers the connect callback's code exchange;
    // any other outside call (e.g. cloud credentials) fails fast.
    const isCodeExchange =
      url.href === 'https://oauth2.googleapis.com/token' && String(init.body).includes('code=c0de');
    return isCodeExchange
      ? new Response(
          JSON.stringify({ access_token: 'g-access', refresh_token: 'g-refresh', expires_in: 3600 })
        )
      : new Response('offline in tests', { status: 503 });
  }
  // The browser's AbortSignal (jsdom) is not Node's; this request is local and quick.
  const { signal: _signal, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (cookieJar.size > 0) {
    headers.set('cookie', [...cookieJar].map(([k, v]) => `${k}=${v}`).join('; '));
  }
  const res = await realFetch(`${base}${url.pathname}${url.search}`, {
    ...rest,
    headers,
    redirect: 'manual',
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const [pair] = setCookie.split(';');
    const eq = pair.indexOf('=');
    cookieJar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  return res;
}

beforeAll(async () => {
  http = createServer((req, res) => {
    void (async () => {
      await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
      const url = new URL(req.url ?? '/', 'http://localhost');
      const p = url.pathname;
      if (await handleOAuthStartRoute(req, res, p)) return;
      if (await handleGoogleCalendarRoutes(req, res, p, url)) return;
      if (await handleIntegrationsRoutes(req, res, p, url)) return;
      res.writeHead(404);
      res.end();
    })();
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  Object.defineProperty(window, 'location', { value: mockLocation, writable: true });
  vi.stubGlobal('fetch', browserFetch);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await new Promise<void>((resolve) => http.close(() => resolve()));
});

/** What the panel shows: the v1 integrations status, as the signed-in user. */
async function panelCalendarStatus(token: string): Promise<unknown> {
  const res = await realFetch(`${base}/api/v1/integrations/status`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { integrations: { calendar: { connected: unknown } } };
  return body.integrations.calendar.connected;
}

describe('Google Calendar: one connect path, one token store', () => {
  it('a connect started from the integrations panel is readable by the calendar service for the same uid', async () => {
    expect(await calendarOAuth.getValidAccessToken('user-A')).toBeNull();
    expect(await panelCalendarStatus('tok-user-A')).toBe(false);

    // The panel's Connect button.
    createIntegrationsCallbacks().onConnectCalendar?.();
    await vi.waitFor(() => expect(mockLocation.href).toMatch(/^\/auth\/google\/login\?state=/));

    // The browser follows the login URL to Google...
    const login = await browserFetch(mockLocation.href);
    expect(login.status).toBe(302);
    const google = new URL(login.headers.get('location') ?? '');
    expect(google.origin).toBe('https://accounts.google.com');
    const state = google.searchParams.get('state') ?? '';

    // ...and Google sends it back with a code.
    const callback = await browserFetch(
      `/auth/google/callback?code=c0de&state=${encodeURIComponent(state)}`
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toContain('status=connected');

    // Every calendar reader goes through google-calendar-oauth: it sees the tokens.
    expect(await calendarOAuth.getValidAccessToken('user-A')).toBe('g-access');
    expect(await calendarOAuth.isCalendarConfigured('user-A')).toBe(true);
    expect(await calendarOAuth.getAllCalendarUsers()).toContain('user-A');
    // Stored encrypted under the user's own document, nowhere else.
    expect([...firestoreDocs.keys()]).toEqual(['bogle_users/user-A/google_calendar_tokens/data']);
    const stored = JSON.stringify(
      firestoreDocs.get('bogle_users/user-A/google_calendar_tokens/data')
    );
    expect(stored).not.toContain('g-access');
    expect(stored).not.toContain('g-refresh');

    // The panel shows it, and only for that user.
    expect(await panelCalendarStatus('tok-user-A')).toBe(true);
    expect(await panelCalendarStatus('tok-user-B')).toBe(false);
    expect(await calendarOAuth.getValidAccessToken('user-B')).toBeNull();
  });

  it("the panel's Disconnect removes the tokens every reader uses", async () => {
    expect(await calendarOAuth.isCalendarConfigured('user-A')).toBe(true);

    await createIntegrationsCallbacks().onDisconnectCalendar?.();

    expect(messageUI.show).toHaveBeenLastCalledWith('Calendar disconnected', 'success', 2500);
    expect(await calendarOAuth.getValidAccessToken('user-A')).toBeNull();
    expect(firestoreDocs.size).toBe(0);
    expect(await panelCalendarStatus('tok-user-A')).toBe(false);
  });

  it('the v1 integrations API no longer runs a second calendar connect flow', async () => {
    const res = await realFetch(`${base}/api/v1/integrations/calendar/connect`, {
      headers: { authorization: 'Bearer tok-user-A' },
    });
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({
      connect: { method: 'POST', url: '/auth/oauth/start', provider: 'google_calendar' },
    });
    const callback = await realFetch(
      `${base}/api/v1/integrations/calendar/callback?code=c&state=s`
    );
    expect(callback.status).toBe(404);
  });
});
