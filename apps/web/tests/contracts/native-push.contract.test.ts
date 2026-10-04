/**
 * Native push token contract: native app → POST /api/push/subscribe|unsubscribe.
 *
 * The web's REAL push service, native-push and push-preference run as the
 * native (Capacitor) app; every apiPost they make is handed, as apiPost sends
 * it (Bearer token for the signed-in uid, `userId` merged into the body), to
 * the server's REAL handlePushRoutes and registerSubscription, over an
 * in-memory Firestore. Only the device (Capacitor plugin), Firebase token
 * verification and storage are doubles.
 *
 * Before: the token went up from the 'registration' listener whenever the
 * device registered (signed in or not), sign-out only removed the listeners
 * (the server kept the token for the old account, so its notifications kept
 * reaching this phone), and a new account signing in never re-registered it.
 */

import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TOKEN = 'apns-device-token-0f3a';

const mocks = vi.hoisted(() => ({
  uid: 'alice' as string | null,
  signOut: vi.fn(),
  unregister: vi.fn(async () => undefined),
  listeners: new Map<string, (data: unknown) => void>(),
  collections: new Map<string, Map<string, unknown>>(),
}));

// ---- Device: the Capacitor push plugin -------------------------------------
vi.mock('@capacitor/push-notifications', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PushNotifications: {
    requestPermissions: vi.fn(async () => ({ receive: 'granted' })),
    addListener: vi.fn(async (event: string, cb: (data: unknown) => void) => {
      mocks.listeners.set(event, cb);
      return { remove: async () => undefined };
    }),
    // APNs answers register() with the device token, asynchronously.
    register: vi.fn(async () => {
      setTimeout(() => mocks.listeners.get('registration')?.({ value: TOKEN }), 0);
    }),
    unregister: mocks.unregister,
    removeAllListeners: vi.fn(async () => mocks.listeners.clear()),
  },
}));

vi.mock('../../src/utils/platform.js', () => ({
  platform: () => 'ios',
  isNative: () => true,
  isIOS: () => true,
  isAndroid: () => false,
  isWeb: () => false,
}));

vi.mock('../../src/services/firebase-auth.service.js', () => ({
  getFirebaseUid: () => mocks.uid,
  signOut: mocks.signOut,
  onAuthStateChange: vi.fn(),
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast: { error: vi.fn() } }));

// ---- Server: real routes and service, fake storage and token verification ----
// (web-push is a server-only dependency apps/web can't resolve; native tokens don't use it)
vi.mock('../../../../src/services/web-push-loader.js', () => ({
  loadWebPush: async () => null,
  isWebPushDeliverable: async () => false,
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

/** apiPost, as it reaches the server: Bearer for the signed-in user, userId merged in. */
vi.mock('../../src/utils/api.js', () => ({
  apiGet: vi.fn(async () => ({ ok: false, status: 404 })),
  apiPost: vi.fn(async (path: string, body: Record<string, unknown>) => {
    const { handlePushRoutes } = await import('../../../../src/servers/api/routes/push.js');
    const req = new EventEmitter() as IncomingMessage;
    req.method = 'POST';
    req.url = path;
    req.headers = mocks.uid ? { authorization: `Bearer verified-${mocks.uid}` } : {};
    let status = 0;
    const res = {
      writeHead: (code: number) => void (status = code),
      setHeader: () => undefined,
      end: () => undefined,
    } as unknown as ServerResponse;
    setTimeout(() => {
      req.emit('data', Buffer.from(JSON.stringify({ userId: 'stale-local-id', ...body })));
      req.emit('end');
    }, 0);
    await handlePushRoutes(req, res, path);
    return { ok: status >= 200 && status < 300, status };
  }),
}));

type Preference = typeof import('../../src/services/push-preference.js');
let syncPushOwner: Preference['syncPushOwner'];
let signOutReleasingPush: Preference['signOutReleasingPush'];
let getEndpointOwner: (endpoint: string) => Promise<string | null>;

function storedEndpoints(uid: string): string[] {
  const doc = mocks.collections.get('push_subscriptions')?.get(uid) as
    | { subscriptions: Array<{ endpoint: string; platform: string }> }
    | undefined;
  return doc?.subscriptions.map((s) => `${s.platform}:${s.endpoint}`) ?? [];
}

/** Wait for the token to land for `uid` (the registration is asynchronous). */
async function registeredFor(uid: string): Promise<void> {
  await vi.waitFor(() => expect(storedEndpoints(uid)).toEqual([`ios:${TOKEN}`]), { timeout: 5000 });
}

// A fresh app launch per test: new service singletons, listeners attached again.
beforeEach(async () => {
  vi.resetModules();
  mocks.listeners.clear();
  mocks.collections.forEach((docs) => docs.clear());
  mocks.unregister.mockClear();
  mocks.signOut.mockClear();
  localStorage.clear();
  mocks.uid = 'alice';
  const service = await import('../../src/services/push-notifications.service.js');
  ({ syncPushOwner, signOutReleasingPush } = await import('../../src/services/push-preference.js'));
  ({ getEndpointOwner } = await import('../../../../src/services/push-endpoint-owners.js'));
  await import('../../../../src/servers/api/routes/push.js'); // cold import here, not in the test
  await service.initPushNotifications();
}, 30_000);

describe('native push token → server', () => {
  it('registers the device token for the signed-in caller as its one owner', async () => {
    expect(storedEndpoints('alice')).toEqual([]);

    await syncPushOwner('alice');

    await registeredFor('alice');
    expect(storedEndpoints('stale-local-id')).toEqual([]);
    expect(await getEndpointOwner(TOKEN)).toBe('alice');
  });

  it('sign-out removes the token on the server, then unregisters the device', async () => {
    await syncPushOwner('alice');
    await registeredFor('alice');

    await signOutReleasingPush();

    expect(storedEndpoints('alice')).toEqual([]);
    expect(await getEndpointOwner(TOKEN)).toBeNull();
    expect(mocks.unregister).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it('the next account to sign in gets the token, and the previous one loses it', async () => {
    await syncPushOwner('alice');
    await registeredFor('alice');
    expect(await getEndpointOwner(TOKEN)).toBe('alice');

    // bob signs in on this phone (no sign-out in between, e.g. an expired session)
    mocks.uid = 'bob';
    await syncPushOwner('bob');

    expect(await getEndpointOwner(TOKEN)).toBe('bob');
    expect(storedEndpoints('bob')).toEqual([`ios:${TOKEN}`]);
    expect(storedEndpoints('alice')).toEqual([]);
  });
});
