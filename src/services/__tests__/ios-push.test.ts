/**
 * iOS push through the push service: a notification the service sends to a
 * person's browser also reaches their iPhone over APNs, only while IOS_PUSH
 * is on for that person, only to devices registered for this app, and a token
 * Apple calls gone is forgotten. Real push service, real device store (shared
 * fake Firestore) and real APNs sender over a fake transport; the per-person
 * flag lookup is a double.
 */
import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFakeFirestore } from '../../tests/helpers/fake-firestore.js';
import type { PushNotificationPayload } from '../push-notifications.js';

const fake = await vi.hoisted(async () =>
  (await import('../../tests/helpers/fake-firestore.js')).newFakeFirestoreState()
);
const h = vi.hoisted(() => ({
  on: new Set<string>(),
  sent: [] as Array<{ origin: string; path: string }>,
  bodies: [] as string[],
  reply: (_path: string) => ({ status: 200, body: '' }),
  configured: true,
  webPayloads: [] as string[],
}));

vi.mock('../../utils/firestore-utils.js', async (importOriginal) => {
  const { createFakeFirestore } = await import('../../tests/helpers/fake-firestore.js');
  return {
    ...(await importOriginal<typeof import('../../utils/firestore-utils.js')>()),
    getFirestoreDb: createFakeFirestore(fake),
  };
});
vi.mock('../persistence/index.js', () => ({
  createPersistenceStore: () => {
    const docs = new Map<string, unknown>();
    return {
      load: async (id: string) => docs.get(id) ?? null,
      readFailed: () => false,
      set: (id: string, d: unknown) => void docs.set(id, d),
      setImmediate: async (id: string, d: unknown) => void docs.set(id, d),
      delete: async (id: string) => void docs.delete(id),
      flush: async () => undefined,
      clearAllCaches: () => undefined,
    };
  },
}));
vi.mock('../platform/cohort-flags.js', () => ({
  flagForUser: vi.fn(async (userId: string, flag: string) =>
    flag === 'IOS_PUSH' && h.on.has(userId) ? 'on' : undefined
  ),
}));
vi.mock('../apns-sender.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../apns-sender.js')>();
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const sender = new real.ApnsSender(
    {
      p8: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      keyId: 'KEY123',
      teamId: 'XT8W26YE9U',
      topic: 'com.sethdford.ferni',
    },
    async (req) => {
      h.sent.push({ origin: req.origin, path: req.path });
      h.bodies.push(req.body);
      return h.reply(req.path);
    }
  );
  return { ...real, getApnsSender: () => (h.configured ? sender : null) };
});

vi.mock('../web-push-loader.js', () => ({
  loadWebPush: async () => ({
    setVapidDetails: () => undefined,
    sendNotification: async (_sub: unknown, payload: string) => void h.webPayloads.push(payload),
  }),
}));

const PushNotificationsBackendService = (await import('../push-notifications.js')).default;
const { registerDevice, listDevices, unregisterDevice } = await import('../push-devices.js');
const { sendIosPush, apnsAlert, recipientTag, LOCK_SCREEN_COPY, REMINDER_COPY, DEFAULT_COPY } =
  await import('../ios-push.js');

const token = (n: number) => n.toString(16).padStart(64, '0');
const device = (n: number, bundleId = 'com.sethdford.ferni') => ({
  platform: 'ios' as const,
  token: token(n),
  bundleId,
  environment: 'production' as const,
  appVersion: '2.0.0',
});
const NOTE = { title: 'Ferni', body: 'How did it go?', type: 'ferni_checkin' as const };

async function send(userId: string): Promise<boolean> {
  const service = new PushNotificationsBackendService();
  await service.initialize();
  return service.sendNotification(userId, NOTE);
}

beforeEach(() => {
  resetFakeFirestore(fake);
  h.on.clear();
  h.sent = [];
  h.bodies = [];
  h.reply = () => ({ status: 200, body: '' });
  h.configured = true;
  h.webPayloads = [];
});

describe('push service → iPhone', () => {
  it('reaches the iPhone of a person with IOS_PUSH on, who has no browser subscription', async () => {
    await registerDevice('alice', device(1));
    h.on.add('alice');

    expect(await send('alice')).toBe(true);
    expect(h.sent).toEqual([
      { origin: 'https://api.push.apple.com', path: `/3/device/${token(1)}` },
    ]);
  });

  it("after bob signs in on alice's phone and registers it, alice's notes skip that phone", async () => {
    await registerDevice('alice', device(1));
    await registerDevice('bob', device(1)); // same token, now bob's
    h.on.add('alice');
    h.on.add('bob');

    expect(await send('alice')).toBe(false);
    expect(h.sent).toEqual([]);

    expect(await send('bob')).toBe(true);
    expect(h.sent.map((r) => r.path)).toEqual([`/3/device/${token(1)}`]);
  });

  it("after alice unregisters on sign-out, her notes don't reach that phone", async () => {
    await registerDevice('alice', device(1));
    h.on.add('alice');
    await unregisterDevice('alice', token(1));

    expect(await send('alice')).toBe(false);
    expect(h.sent).toEqual([]);
  });

  it('sends nothing to Apple while IOS_PUSH is off for the person', async () => {
    await registerDevice('bob', device(2));

    expect(await send('bob')).toBe(false);
    expect(h.sent).toEqual([]);
  });

  it('sends nothing while the APNs secrets are unset', async () => {
    await registerDevice('alice', device(1));
    h.on.add('alice');
    h.configured = false;

    expect(await send('alice')).toBe(false);
    expect(h.sent).toEqual([]);
  });

  it("skips a device registered for another app's bundle id", async () => {
    await registerDevice('alice', device(1, 'com.example.other'));
    h.on.add('alice');

    expect(await send('alice')).toBe(false);
    expect(h.sent).toEqual([]);
  });

  it('forgets a token Apple says is gone, keeps the one that worked', async () => {
    await registerDevice('alice', device(1));
    await registerDevice('alice', device(2));
    h.on.add('alice');
    h.reply = (path) =>
      path.endsWith(token(1))
        ? { status: 410, body: '{"reason":"Unregistered"}' }
        : { status: 200, body: '' };

    expect(await send('alice')).toBe(true);
    expect((await listDevices('alice')).map((d) => d.token)).toEqual([token(2)]);
  });

  it('reports not sent when Apple refuses every device', async () => {
    await registerDevice('alice', device(1));
    h.on.add('alice');
    h.reply = () => ({ status: 500, body: '{"reason":"InternalServerError"}' });

    expect(await send('alice')).toBe(false);
    expect(await listDevices('alice')).toHaveLength(1);
  });

  it("doesn't throw when the device store is down", async () => {
    h.on.add('alice');
    fake.up = false;
    expect(await sendIosPush('alice', NOTE)).toBe(false);
  });
});

describe('recipient tag', () => {
  afterEach(() => vi.unstubAllEnvs());

  it("tags each push with the recipient's opaque tag, never their uid", async () => {
    vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
    await registerDevice('alice-uid-123', device(1));
    h.on.add('alice-uid-123');

    expect(await send('alice-uid-123')).toBe(true);

    const body = JSON.parse(h.bodies[0]) as { r?: string; aps?: unknown };
    expect(body.r).toBe(recipientTag('alice-uid-123'));
    expect(body.r).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(h.bodies[0]).not.toContain('alice-uid-123');
  });

  it('is stable for a person, different between people, and keyed by the secret', () => {
    const env = { LOG_HASH_SECRET: 'test-secret' };
    expect(recipientTag('alice', env)).toBe(recipientTag('alice', env));
    expect(recipientTag('alice', env)).not.toBe(recipientTag('bob', env));
    expect(recipientTag('alice', { LOG_HASH_SECRET: 'other' })).not.toBe(
      recipientTag('alice', env)
    );
  });

  it('is left out without the secret, rather than sending a guessable one', async () => {
    vi.stubEnv('LOG_HASH_SECRET', '');
    expect(recipientTag('alice')).toBeNull();
    await registerDevice('alice', device(1));
    h.on.add('alice');

    await send('alice');

    expect(JSON.parse(h.bodies[0])).not.toHaveProperty('r');
  });
});

describe('apnsAlert', () => {
  it('puts the notification type, persona and ids beside the alert for the app', () => {
    expect(apnsAlert({ ...NOTE, personaId: 'maya', data: { triggerId: 't1' } })).toEqual({
      ...LOCK_SCREEN_COPY.ferni_checkin,
      threadId: 'ferni_checkin',
      data: { triggerId: 't1', type: 'ferni_checkin', personaId: 'maya' },
    });
  });
});

describe('lock screen: no names, no words', () => {
  afterEach(() => vi.unstubAllEnvs());

  // Distinctive fixture strings: the title, body and data a real note could carry.
  const PRIVATE = ['Dana', 'biopsy', 'Dr. Okafor', 'Thursday'];
  function personal(type: string, data: Record<string, unknown> = {}): PushNotificationPayload {
    const payload: Omit<PushNotificationPayload, 'type'> & { type: string } = {
      title: 'Dana called about the biopsy',
      body: 'Dana said the biopsy with Dr. Okafor moved to Thursday.',
      type,
      data: { messageId: 'm-1', callerName: 'Dana', topic: 'biopsy', ...data },
    };
    // An unknown type reaches the sender only through a cast; this is that cast.
    return payload as PushNotificationPayload;
  }

  /** The JSON Apple gets for this payload, through the real sender. */
  async function encoded(payload: PushNotificationPayload) {
    await registerDevice('alice', device(1));
    h.on.add('alice');
    h.bodies = [];
    expect(await sendIosPush('alice', payload)).toBe(true);
    return { raw: h.bodies[0], json: JSON.parse(h.bodies[0]) as Record<string, any> };
  }

  type Case = [string, PushNotificationPayload, { title: string; body: string }];
  const cases: Case[] = [
    ...Object.entries(LOCK_SCREEN_COPY).map(([type, copy]): Case => [type, personal(type), copy]),
    [
      'general reminder',
      personal('general', { kind: 'reminder', reminderId: 'r-1' }),
      REMINDER_COPY,
    ],
    ['note reminder', personal('ferni_checkin', { kind: 'reminder' }), REMINDER_COPY],
    ['unknown kind', personal('some_new_kind'), DEFAULT_COPY],
    ['inherited key', personal('toString'), DEFAULT_COPY],
  ];

  it.each(cases)(
    '%s: the alert is generic and holds none of the note',
    async (_k, payload, copy) => {
      const { raw, json } = await encoded(payload);

      expect(json.aps.alert).toEqual(copy);
      for (const secret of PRIVATE) {
        expect(JSON.stringify(json.aps.alert)).not.toContain(secret);
        expect(raw).not.toContain(secret); // not in data either
      }
    }
  );

  it('keeps the ids the app opens the note with, and the type', async () => {
    const { json } = await encoded(personal('general', { kind: 'reminder', reminderId: 'r-1' }));
    expect(json.data).toEqual({
      messageId: 'm-1',
      kind: 'reminder',
      reminderId: 'r-1',
      type: 'general',
    });
    expect(json.aps['thread-id']).toBe('general');
  });

  it('still tags the push with the right recipient', async () => {
    vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
    const { json } = await encoded(personal('ferni_checkin'));
    expect(json.r).toBe(recipientTag('alice'));
    expect(json.r).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('has the friend voice: no AI, no em dashes, no ellipses', () => {
    for (const { title, body } of [
      ...Object.values(LOCK_SCREEN_COPY),
      REMINDER_COPY,
      DEFAULT_COPY,
    ]) {
      expect(`${title} ${body}`).not.toMatch(/\bAI\b|\u2014|\u2026|\.\.\./);
    }
  });

  it("the browser's web push still carries the note's own title and body", async () => {
    const service = new PushNotificationsBackendService();
    await service.registerSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'p', auth: 'a' },
      platform: 'web',
      userId: 'alice',
      createdAt: new Date().toISOString(),
    });

    expect(await service.sendNotification('alice', personal('ferni_checkin'))).toBe(true);

    const web = JSON.parse(h.webPayloads[0]) as { title: string; body: string };
    expect(web.title).toBe('Dana called about the biopsy');
    expect(web.body).toBe('Dana said the biopsy with Dr. Okafor moved to Thursday.');
  });
});
