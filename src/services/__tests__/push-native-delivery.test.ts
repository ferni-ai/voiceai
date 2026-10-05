/**
 * A native push goes to the subscription's own device token, never to tokens
 * the user no longer owns.
 *
 * sendNativePush used to register each token into the outreach module's
 * in-memory registry and then send to EVERY token registered there for the
 * user. That registry never learns a token moved to another account, so once
 * alice's phone token was taken over by bob (same phone, new sign-in), alice's
 * notifications kept reaching bob's phone through it. Real backend service and
 * real FCM sender; only Firestore and the FCM/OAuth HTTP endpoints are doubles.
 */

import { generateKeyPairSync } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const collections = vi.hoisted(() => new Map<string, Map<string, unknown>>());

vi.mock('../persistence/index.js', () => ({
  createPersistenceStore: ({ collection }: { collection: string }) => {
    if (!collections.has(collection)) collections.set(collection, new Map());
    const docs = collections.get(collection)!;
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

import { initializePushNotifications } from '../outreach/delivery/push-notifications.js';
import PushNotificationsBackendService from '../push-notifications.js';

const PHONE = 'fcm-token-shared-phone';
const ALICE_TABLET = 'fcm-token-alice-tablet';
const NOTE = { title: 'For alice', body: 'private', type: 'ferni_checkin' as const };

/** FCM tokens each send was addressed to. */
const sentTo: string[] = [];
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  collections.forEach((docs) => docs.clear());
  sentTo.length = 0;
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  initializePushNotifications({
    firebaseProjectId: 'test-project',
    firebaseClientEmail: 'push@test-project.iam.gserviceaccount.com',
    firebasePrivateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { body?: string }) => {
      if (url.startsWith('https://oauth2.googleapis.com/')) {
        return ok({ access_token: 'at', expires_in: 3600 });
      }
      const message = JSON.parse(init?.body ?? '{}') as { message?: { token?: string } };
      sentTo.push(message.message?.token ?? '');
      return ok({ name: `projects/test-project/messages/${sentTo.length}` });
    })
  );
});

afterEach(() => vi.unstubAllGlobals());

const native = (endpoint: string, userId: string) => ({
  endpoint,
  keys: { p256dh: '', auth: '' },
  platform: 'ios' as const,
  userId,
  createdAt: new Date().toISOString(),
});

describe('native push delivery', () => {
  it("after bob takes over the phone's token, alice's notifications skip it", async () => {
    const service = new PushNotificationsBackendService();
    await service.initialize();

    await service.registerSubscription(native(PHONE, 'alice'));
    expect(await service.sendNotification('alice', NOTE)).toBe(true);
    expect(sentTo).toEqual([PHONE]);

    // bob signs in on the phone (the server moves the token to him); alice adds a tablet
    await service.registerSubscription(native(PHONE, 'bob'));
    await service.registerSubscription(native(ALICE_TABLET, 'alice'));
    sentTo.length = 0;

    expect(await service.sendNotification('alice', NOTE)).toBe(true);
    expect(sentTo).toEqual([ALICE_TABLET]);
  });

  it('sends each subscription once, to its own token', async () => {
    const service = new PushNotificationsBackendService();
    await service.initialize();
    await service.registerSubscription(native(PHONE, 'carol'));
    await service.registerSubscription(native(ALICE_TABLET, 'carol'));

    await service.sendNotification('carol', NOTE);

    expect(sentTo.sort()).toEqual([ALICE_TABLET, PHONE].sort());
  });
});
