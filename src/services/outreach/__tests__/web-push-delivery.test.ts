/**
 * WEB_PUSH_DELIVERY: an outreach push reaches a web user's browser.
 *
 * Real backend push service, real web-push loader (endpoint allow-list) and
 * the real per-person cohort flag read; only Firestore (the persistence store
 * and the cohort store) and the web-push module's network send are doubles.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const collections = vi.hoisted(() => new Map<string, Map<string, unknown>>());
const webPushSend = vi.hoisted(() => vi.fn(async (_sub: unknown, _payload: string) => ({})));
const logged = vi.hoisted(() => [] as unknown[]);

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

vi.mock('../../../utils/safe-logger.js', async (orig) => {
  const real = await orig<typeof import('../../../utils/safe-logger.js')>();
  const capture: Record<string, (...args: unknown[]) => unknown> = {};
  for (const level of ['info', 'debug', 'error', 'warn', 'trace', 'fatal']) {
    capture[level] = (...args: unknown[]) => void logged.push(args);
  }
  capture.child = () => capture;
  return { ...real, getLogger: () => capture, createLogger: () => capture };
});

import PushNotificationsBackendService from '../../push-notifications.js';
import { forgetFlagCache, type CohortStore } from '../../platform/cohort-flags.js';
import { webPushDeliveryOn } from '../web-push-flag.js';
import {
  outreachPushPayload,
  sendOutreachWebPush,
  type WebPushDeps,
} from '../web-push-delivery.js';

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/browser-of-ana';
const KEYS = { p256dh: 'p256dh-key', auth: 'auth-key' };
const NOTE = {
  text: 'How did the talk with your sister go?',
  personaId: 'ferni',
  kind: 'reengagement_warmth',
  triggerId: 't-1',
};

/** Cohort flags as Firestore would hold them: an override per person. */
function cohortStore(overrides: Record<string, Record<string, string>>): CohortStore {
  return {
    cohortsFor: async () => [],
    overridesFor: async (userId) => overrides[userId] ?? {},
  };
}

function deps(service: PushNotificationsBackendService, store: CohortStore): WebPushDeps {
  return {
    isOn: (userId) => webPushDeliveryOn(userId, { env: { COHORT_FLAGS: 'on' }, store }),
    send: (userId, payload) => service.sendNotification(userId, payload),
  };
}

async function subscribed(userId: string): Promise<PushNotificationsBackendService> {
  const service = new PushNotificationsBackendService();
  await service.registerSubscription({
    endpoint: ENDPOINT,
    keys: KEYS,
    platform: 'web',
    userId,
    createdAt: new Date().toISOString(),
  });
  return service;
}

const stored = (userId: string) =>
  collections.get('push_subscriptions')?.get(userId) as { subscriptions: unknown[] } | undefined;

beforeEach(() => {
  collections.forEach((docs) => docs.clear());
  webPushSend.mockReset().mockResolvedValue({});
  logged.length = 0;
  forgetFlagCache();
  vi.stubEnv('VAPID_PUBLIC_KEY', 'test-public');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private');
});

afterEach(() => vi.unstubAllEnvs());

describe('outreach web push (WEB_PUSH_DELIVERY)', () => {
  it('flag off for the person: no web push is sent, even with a subscription', async () => {
    const service = await subscribed('ana');
    const off = cohortStore({ ana: { WEB_PUSH_DELIVERY: 'off' } });

    expect(await sendOutreachWebPush('ana', NOTE, deps(service, off))).toBe(false);
    expect(await sendOutreachWebPush('ana', NOTE, deps(service, cohortStore({})))).toBe(false);
    expect(webPushSend).not.toHaveBeenCalled();
  });

  it("flag on: exactly one send, to the person's endpoint, with the note as the payload", async () => {
    const service = await subscribed('ana');
    const on = cohortStore({ ana: { WEB_PUSH_DELIVERY: 'on' } });

    expect(await sendOutreachWebPush('ana', NOTE, deps(service, on))).toBe(true);

    expect(webPushSend).toHaveBeenCalledTimes(1);
    const [subscription, body] = webPushSend.mock.calls[0];
    expect(subscription).toEqual({ endpoint: ENDPOINT, keys: KEYS });
    expect(JSON.parse(body)).toMatchObject({
      title: 'Ferni',
      body: NOTE.text,
      type: 'ferni_checkin',
      data: { kind: 'reengagement_warmth', triggerId: 't-1' },
    });
  });

  it("flag on for one person reaches only that person's browser", async () => {
    const service = await subscribed('ana');
    const onForBo = cohortStore({ bo: { WEB_PUSH_DELIVERY: 'on' } });

    expect(await sendOutreachWebPush('ana', NOTE, deps(service, onForBo))).toBe(false);
    expect(webPushSend).not.toHaveBeenCalled();
  });

  it('a 410 from the push service removes the subscription, and the next send skips it', async () => {
    const service = await subscribed('ana');
    const on = cohortStore({ ana: { WEB_PUSH_DELIVERY: 'on' } });
    expect(stored('ana')?.subscriptions).toHaveLength(1);
    webPushSend.mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }));

    expect(await sendOutreachWebPush('ana', NOTE, deps(service, on))).toBe(false);

    expect(stored('ana')?.subscriptions).toEqual([]); // emptied, never a whole-doc delete
    expect(await sendOutreachWebPush('ana', NOTE, deps(service, on))).toBe(false);
    expect(webPushSend).toHaveBeenCalledTimes(1);
  });

  it('a failed send never logs the endpoint or its keys', async () => {
    const service = await subscribed('ana');
    const on = cohortStore({ ana: { WEB_PUSH_DELIVERY: 'on' } });
    webPushSend.mockRejectedValueOnce(
      Object.assign(new Error('Received unexpected response code'), {
        statusCode: 500,
        endpoint: ENDPOINT,
        body: 'x',
      })
    );

    await sendOutreachWebPush('ana', NOTE, deps(service, on));

    const text = JSON.stringify(logged, (_k, v: unknown) => (v instanceof Error ? v.message : v));
    expect(text).toContain('Failed to send push notification');
    expect(text).not.toContain('browser-of-ana');
    expect(text).not.toContain('p256dh-key');
    expect(stored('ana')?.subscriptions).toHaveLength(1); // a 500 is not "gone"
  });

  it('a long note becomes one lock-screen line', () => {
    const payload = outreachPushPayload({ ...NOTE, text: `${'word '.repeat(60)}end` });
    expect(payload.body.length).toBeLessThanOrEqual(140);
    expect(payload.body.endsWith('…')).toBe(true);
  });
});

describe('push service in a fresh process', () => {
  it('the first send waits for setup instead of finding no subscriptions', async () => {
    const writer = await subscribed('ana');
    expect(writer).toBeDefined();
    // A new process: nobody called initialize() and waited for it.
    const fresh = new PushNotificationsBackendService();

    expect(await fresh.sendNotification('ana', { title: 't', body: 'b', type: 'general' })).toBe(
      true
    );
    expect(webPushSend).toHaveBeenCalledTimes(1);
  });

  it('the first subscribe is saved, not answered and dropped', async () => {
    await subscribed('ana');
    expect(stored('ana')?.subscriptions).toHaveLength(1);
  });
});
