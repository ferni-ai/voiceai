/**
 * Web push contract: browser → GET /api/push/vapid-key, POST /api/push/subscribe|unsubscribe.
 *
 * The web's REAL push service and push-preference run in jsdom; every apiGet and
 * apiPost they make is handed, as the api helpers send it (Bearer token for the
 * signed-in uid, `userId` merged into the body), to the server's REAL
 * handlePushRoutes and registerSubscription over an in-memory Firestore. Only the
 * browser's PushManager, Firebase token verification and storage are doubles.
 *
 * There is no native shell around the web app (the iOS app is native Swift), so a
 * page that happens to carry a `window.Capacitor` global must still subscribe
 * through web push. Before, that global switched the service to a Capacitor
 * plugin that never answered, and the browser was never registered.
 */

import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/web-endpoint-0f3a';
const KEYS = { p256dh: 'p256dh-key', auth: 'auth-key' };
// A real-shaped (65-byte, base64url) P-256 public key, served by the real route
const VAPID_KEY =
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

const mocks = vi.hoisted(() => {
  process.env.VAPID_PUBLIC_KEY =
    'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
  return {
    uid: 'alice' as string | null,
    signOut: vi.fn(),
    pushSubscribe: vi.fn(),
    browserUnsubscribe: vi.fn(async () => true),
    live: null as null | { endpoint: string },
    collections: new Map<string, Map<string, unknown>>(),
  };
});

vi.mock('../../src/services/firebase-auth.service.js', () => ({
  getFirebaseUid: () => mocks.uid,
  signOut: mocks.signOut,
  onAuthStateChange: vi.fn(),
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast: { error: vi.fn() } }));

// ---- Server: real routes and service, fake storage and token verification ----
// (web-push is a server-only dependency apps/web can't resolve; nothing is sent here)
vi.mock('../../../../src/services/web-push-loader.js', () => ({
  loadWebPush: async () => null,
  isWebPushDeliverable: async () => true,
}));
vi.mock('../../../../src/services/persistence/index.js', () => ({
  createPersistenceStore: ({ collection }: { collection: string }) => {
    if (!mocks.collections.has(collection)) mocks.collections.set(collection, new Map());
    const docs = mocks.collections.get(collection)!;
    return {
      get: async (id: string) => docs.get(id) ?? null,
      load: async (id: string) => docs.get(id) ?? null,
      set: (id: string, data: unknown) => void docs.set(id, data),
      setImmediate: async (id: string, data: unknown) => void docs.set(id, data),
      delete: async (id: string) => void docs.delete(id),
      flush: async () => undefined,
      shutdown: async () => undefined,
    };
  },
}));
vi.mock('../../../../src/api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    const match = String(req.headers.authorization ?? '').match(/^Bearer verified-(.+)$/);
    if (!match) {
      res.writeHead(401);
      res.end('{"error":"Auth required"}');
      return null;
    }
    return { userId: match[1], isAdmin: false };
  }),
  requireAdmin: vi.fn(() => null),
  rateLimit: vi.fn(() => false),
}));

/** Send one request to the real push routes, as the api helpers would. */
async function toServer(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data?: unknown }> {
  const { handlePushRoutes } = await import('../../../../src/servers/api/routes/push.js');
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = path;
  req.headers = mocks.uid ? { authorization: `Bearer verified-${mocks.uid}` } : {};
  let status = 0;
  let payload = '';
  const res = {
    writeHead: (code: number) => void (status = code),
    setHeader: () => undefined,
    end: (chunk?: string) => void (payload = chunk ?? ''),
  } as unknown as ServerResponse;
  if (body) {
    setTimeout(() => {
      req.emit('data', Buffer.from(JSON.stringify({ userId: 'stale-local-id', ...body })));
      req.emit('end');
    }, 0);
  }
  await handlePushRoutes(req, res, path);
  const ok = status >= 200 && status < 300;
  return { ok, status, data: ok && payload ? (JSON.parse(payload) as unknown) : undefined };
}

vi.mock('../../src/utils/api.js', () => ({
  apiGet: vi.fn((path: string) => toServer('GET', path)),
  apiPost: vi.fn((path: string, body: Record<string, unknown>) => toServer('POST', path, body)),
}));

type Preference = typeof import('../../src/services/push-preference.js');
let applyPushPreference: Preference['applyPushPreference'];
let signOutReleasingPush: Preference['signOutReleasingPush'];
let getEndpointOwner: (endpoint: string) => Promise<string | null>;

function storedEndpoints(uid: string): string[] {
  const doc = mocks.collections.get('push_subscriptions')?.get(uid) as
    | { subscriptions: Array<{ endpoint: string; platform: string }> }
    | undefined;
  return doc?.subscriptions.map((s) => `${s.platform}:${s.endpoint}`) ?? [];
}

function stubBrowser(): void {
  vi.stubGlobal('Notification', {
    permission: 'granted',
    requestPermission: vi.fn(() => Promise.resolve('granted')),
  });
  vi.stubGlobal('PushManager', {});
  const pushManager = {
    subscribe: mocks.pushSubscribe,
    getSubscription: vi.fn(async () =>
      mocks.live ? { ...mocks.live, unsubscribe: mocks.browserUnsubscribe } : null
    ),
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register: vi.fn(async () => ({ pushManager })),
      getRegistration: vi.fn(async () => ({ pushManager })),
      addEventListener: vi.fn(),
    },
  });
  mocks.pushSubscribe.mockImplementation(async () => {
    mocks.live = { endpoint: ENDPOINT };
    return { endpoint: ENDPOINT, toJSON: () => ({ endpoint: ENDPOINT, keys: KEYS }) };
  });
}

/** A fresh page load: new service singletons, service worker registered again. */
async function loadPage(): Promise<void> {
  vi.resetModules();
  const service = await import('../../src/services/push-notifications.service.js');
  ({ applyPushPreference, signOutReleasingPush } =
    await import('../../src/services/push-preference.js'));
  ({ getEndpointOwner } = await import('../../../../src/services/push-endpoint-owners.js'));
  await import('../../../../src/servers/api/routes/push.js'); // cold import here, not in the test
  await service.initPushNotifications();
}

// Cold-import (transform) the client and server modules once, outside any test's timeout.
beforeAll(async () => {
  await import('../../src/services/push-preference.js');
  await import('../../../../src/servers/api/routes/push.js');
}, 60_000);

beforeEach(() => {
  mocks.collections.forEach((docs) => docs.clear());
  mocks.signOut.mockClear();
  mocks.browserUnsubscribe.mockClear();
  mocks.pushSubscribe.mockReset();
  mocks.live = null;
  mocks.uid = 'alice';
  localStorage.clear();
  stubBrowser();
});

afterEach(() => {
  Reflect.deleteProperty(window, 'Capacitor');
  vi.unstubAllGlobals();
});

describe('web push subscription → server', () => {
  it('turning notifications on registers the browser for the signed-in caller', async () => {
    await loadPage();
    expect(storedEndpoints('alice')).toEqual([]);

    await applyPushPreference(true);

    expect(storedEndpoints('alice')).toEqual([`web:${ENDPOINT}`]);
    expect(storedEndpoints('stale-local-id')).toEqual([]);
    expect(await getEndpointOwner(ENDPOINT)).toBe('alice');
    // The browser subscribed with the key the server handed out
    const { applicationServerKey } = mocks.pushSubscribe.mock.calls[0]![0] as {
      applicationServerKey: ArrayBuffer;
    };
    expect(applicationServerKey.byteLength).toBe(65);
    expect(Buffer.from(applicationServerKey).toString('base64url')).toBe(VAPID_KEY);
  }, 20_000);

  it('sign-out removes the subscription on the server, then in the browser', async () => {
    await loadPage();
    await applyPushPreference(true);
    expect(storedEndpoints('alice')).toEqual([`web:${ENDPOINT}`]);

    await signOutReleasingPush();

    expect(storedEndpoints('alice')).toEqual([]);
    expect(await getEndpointOwner(ENDPOINT)).toBeNull();
    expect(mocks.browserUnsubscribe).toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  }, 20_000);

  it('a page carrying a Capacitor global still subscribes through web push', async () => {
    Object.defineProperty(window, 'Capacitor', {
      configurable: true,
      value: { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} },
    });
    await loadPage();

    await applyPushPreference(true);

    expect(mocks.pushSubscribe).toHaveBeenCalledTimes(1);
    expect(storedEndpoints('alice')).toEqual([`web:${ENDPOINT}`]);
  }, 20_000);
});
