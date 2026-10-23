/**
 * The outreach 'push' channel (unified-delivery deliver) reaches a web user's
 * browser when WEB_PUSH_DELIVERY is on for them, through the real backend push
 * service. Off, it behaves as before: no web push, FCM or an in-app note.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const collections = vi.hoisted(() => new Map<string, Map<string, unknown>>());
const webPushSend = vi.hoisted(() => vi.fn(async (_sub: unknown, _payload: string) => ({})));
const flagOnFor = vi.hoisted(() => new Set<string>());

vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: webPushSend },
}));
vi.mock('../../persistence/index.js', () => ({
  createPersistenceStore: ({ collection }: { collection: string }) => {
    if (!collections.has(collection)) collections.set(collection, new Map());
    const docs = collections.get(collection)!;
    return {
      load: async (id: string) => docs.get(id) ?? null,
      readFailed: () => false,
      set: (id: string, data: unknown) => void docs.set(id, data),
      setImmediate: async (id: string, data: unknown) => void docs.set(id, data),
      delete: async (id: string) => void docs.delete(id),
      flush: async () => undefined,
      clearAllCaches: () => undefined,
    };
  },
}));
// No Firestore: delivery records and in-app notes are no-ops here.
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
vi.mock('../web-push-flag.js', () => ({
  webPushDeliveryOn: async (userId: string) => flagOnFor.has(userId),
}));

import { getPushNotificationsService } from '../../push-notifications.js';
import { deliver } from '../unified-delivery.js';

const request = (userId: string) => ({
  userId,
  channel: 'push' as const,
  outreachType: 'reengagement_warmth' as const,
  content: { text: 'Thinking about your interview today.', personaId: 'ferni' },
});

beforeEach(async () => {
  collections.forEach((docs) => docs.clear());
  webPushSend.mockReset().mockResolvedValue({});
  flagOnFor.clear();
  vi.stubEnv('VAPID_PUBLIC_KEY', 'test-public');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private');
  for (const k of [
    'FCM_PROJECT_ID',
    'FCM_PRIVATE_KEY',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GCP_PROJECT_ID',
  ]) {
    vi.stubEnv(k, '');
  }
  await getPushNotificationsService().registerSubscription({
    endpoint: 'https://fcm.googleapis.com/fcm/send/ana-browser',
    keys: { p256dh: 'p', auth: 'a' },
    platform: 'web',
    userId: 'ana',
    createdAt: new Date().toISOString(),
  });
});

describe("deliver({ channel: 'push' }) for a web user", () => {
  it('flag off: no web push; falls back as before', async () => {
    const result = await deliver(request('ana') as Parameters<typeof deliver>[0]);
    expect(webPushSend).not.toHaveBeenCalled();
    expect(result.channel).toBe('in_app');
  });

  it("flag on: one web push to the person's browser, reported as a push", async () => {
    flagOnFor.add('ana');
    const result = await deliver(request('ana') as Parameters<typeof deliver>[0]);
    expect(result).toMatchObject({ success: true, channel: 'push' });
    expect(webPushSend).toHaveBeenCalledTimes(1);
    expect(JSON.parse(webPushSend.mock.calls[0][1])).toMatchObject({
      body: 'Thinking about your interview today.',
      data: { kind: 'reengagement_warmth' },
    });
  });

  it('flag on but no subscription: falls back as before', async () => {
    flagOnFor.add('bo');
    const result = await deliver(request('bo') as Parameters<typeof deliver>[0]);
    expect(webPushSend).not.toHaveBeenCalled();
    expect(result.channel).toBe('in_app');
  });
});
