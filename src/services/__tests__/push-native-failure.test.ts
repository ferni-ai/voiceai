/**
 * A native (FCM) subscription that wasn't reached is reported as not sent.
 *
 * sendNativePush used to return quietly when FCM wasn't configured (prod has
 * no FCM credentials) and when FCM refused the token, so sendNotification
 * counted the push as delivered and callers skipped their fallback. Real
 * backend service and real FCM sender; Firestore and FCM's HTTP endpoints are
 * doubles.
 */
import { generateKeyPairSync } from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const docs = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../persistence/index.js', () => ({
  createPersistenceStore: ({ collection }: { collection: string }) => ({
    load: async (id: string) => docs.get(`${collection}/${id}`) ?? null,
    set: (id: string, d: unknown) => void docs.set(`${collection}/${id}`, d),
    setImmediate: async (id: string, d: unknown) => void docs.set(`${collection}/${id}`, d),
    delete: async (id: string) => void docs.delete(`${collection}/${id}`),
    flush: async () => undefined,
  }),
}));

const { initializePushNotifications } = await import('../outreach/delivery/push-notifications.js');
const PushNotificationsBackendService = (await import('../push-notifications.js')).default;

const NOTE = { title: 'For alice', body: 'private', type: 'ferni_checkin' as const };
const native = (endpoint: string) => ({
  endpoint,
  keys: { p256dh: '', auth: '' },
  platform: 'android' as const,
  userId: 'alice',
  createdAt: new Date().toISOString(),
});
const subscribed = () =>
  (docs.get('push_subscriptions/alice') as { subscriptions: unknown[] } | undefined)
    ?.subscriptions ?? [];

afterEach(() => vi.unstubAllGlobals());

describe('native push failures', () => {
  // First: this file's FCM module has never been initialized.
  it('is not sent when FCM is not configured', async () => {
    const service = new PushNotificationsBackendService();
    await service.initialize();
    await service.registerSubscription(native('fcm-token-1'));

    expect(await service.sendNotification('alice', NOTE)).toBe(false);
    expect(subscribed()).toHaveLength(1); // not configured is not the token's fault
  });

  it('is not sent when FCM refuses the token, and the dead token is dropped', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    initializePushNotifications({
      firebaseProjectId: 'test-project',
      firebaseClientEmail: 'push@test-project.iam.gserviceaccount.com',
      firebasePrivateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('https://oauth2.googleapis.com/')
          ? { ok: true, status: 200, json: async () => ({ access_token: 'at', expires_in: 3600 }) }
          : {
              ok: false,
              status: 404,
              json: async () => ({
                error: { message: 'gone', details: [{ errorCode: 'UNREGISTERED' }] },
              }),
            }
      )
    );
    const service = new PushNotificationsBackendService();
    await service.initialize();
    await service.registerSubscription(native('fcm-token-2'));

    expect(await service.sendNotification('alice', NOTE)).toBe(false);
    expect(subscribed()).toEqual([]);
  });
});
