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

const fake = await vi.hoisted(async () =>
  (await import('../../tests/helpers/fake-firestore.js')).newFakeFirestoreState()
);
const h = vi.hoisted(() => ({
  on: new Set<string>(),
  sent: [] as Array<{ origin: string; path: string }>,
  bodies: [] as string[],
  reply: (_path: string) => ({ status: 200, body: '' }),
  configured: true,
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

const PushNotificationsBackendService = (await import('../push-notifications.js')).default;
const { registerDevice, listDevices, unregisterDevice } = await import('../push-devices.js');
const { sendIosPush, apnsAlert, recipientTag } = await import('../ios-push.js');

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
  it('puts the notification type and persona beside the alert for the app', () => {
    expect(apnsAlert({ ...NOTE, personaId: 'maya', data: { triggerId: 't1' } })).toEqual({
      title: 'Ferni',
      body: 'How did it go?',
      threadId: 'ferni_checkin',
      data: { triggerId: 't1', type: 'ferni_checkin', personaId: 'maya' },
    });
  });
});
