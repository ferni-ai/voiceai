/**
 * POST/DELETE /api/push/devices: the iPhone app registers its APNs device token
 * for the VERIFIED caller (anonymous Firebase users included), never for a
 * service API key, never for a uid named in the body, and never echoes or
 * logs the token. Real route and real device store over the shared in-memory
 * Firestore; only the token verifier is a double.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFakeFirestore } from '../../../../tests/helpers/fake-firestore.js';

const fake = await vi.hoisted(async () =>
  (await import('../../../../tests/helpers/fake-firestore.js')).newFakeFirestoreState()
);

vi.mock('../../../../utils/firestore-utils.js', async (importOriginal) => {
  const { createFakeFirestore } = await import('../../../../tests/helpers/fake-firestore.js');
  return {
    ...(await importOriginal<typeof import('../../../../utils/firestore-utils.js')>()),
    getFirestoreDb: createFakeFirestore(fake),
  };
});

vi.mock('../../../../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.headers['x-api-key'] === 'service-key') {
      return { userId: 'api-user', isAdmin: false, isDevMode: false, authMethod: 'api_key' };
    }
    const header = req.headers.authorization;
    const match = typeof header === 'string' ? header.match(/^Bearer (anon|verified)-(.+)$/) : null;
    if (!match) {
      res.writeHead(401);
      res.end('{"error":"Auth required"}');
      return null;
    }
    return {
      userId: match[2],
      firebaseUid: match[2],
      isAdmin: false,
      isDevMode: false,
      authMethod: 'firebase',
      isAnonymous: match[1] === 'anon',
    };
  }),
  requireAdmin: vi.fn(() => null),
  rateLimit: vi.fn(() => false),
}));

const { handlePushRoutes } = await import('../push.js');
const { listDevices } = await import('../../../../services/push-devices.js');

const TOKEN = 'ab'.repeat(32);
const DEVICE = {
  platform: 'ios',
  token: TOKEN,
  bundleId: 'com.sethdford.ferni',
  environment: 'sandbox',
  appVersion: '2.0.0',
};

function request(method: string, body: unknown, headers: Record<string, string>): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = '/api/push/devices';
  req.headers = headers;
  setTimeout(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
  return req;
}

async function call(method: string, body: unknown, headers: Record<string, string>) {
  const sent = { status: 0, body: '' };
  const res = {
    writeHead: vi.fn((status: number) => {
      sent.status = status;
    }),
    setHeader: vi.fn(),
    end: vi.fn((data?: string) => {
      sent.body = data ?? '';
    }),
  } as unknown as ServerResponse;
  const handled = await handlePushRoutes(request(method, body, headers), res, '/api/push/devices');
  return { handled, ...sent };
}

const as = (uid: string, kind = 'verified') => ({ authorization: `Bearer ${kind}-${uid}` });

describe('POST /api/push/devices', () => {
  beforeEach(() => resetFakeFirestore(fake));

  it("stores the device for the verified caller, not a userId in the body, and doesn't echo the token", async () => {
    expect(await listDevices('alice')).toEqual([]);

    const res = await call('POST', { ...DEVICE, userId: 'bob' }, as('alice'));

    expect(res.status).toBe(200);
    expect(res.body).not.toContain(TOKEN);
    const devices = await listDevices('alice');
    expect(devices.map((d) => [d.token, d.environment, d.bundleId, d.appVersion])).toEqual([
      [TOKEN, 'sandbox', 'com.sethdford.ferni', '2.0.0'],
    ]);
    expect(await listDevices('bob')).toEqual([]);
  });

  it("answers with the caller's own recipient tag, the one their pushes carry, never the uid", async () => {
    vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
    const { recipientTag } = await import('../../../../services/ios-push.js');

    const res = await call('POST', DEVICE, as('alice-uid-123'));

    const body = JSON.parse(res.body) as { success?: boolean; recipientTag?: string };
    expect(body).toEqual({ success: true, recipientTag: recipientTag('alice-uid-123') });
    expect(body.recipientTag).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(body.recipientTag).not.toBe(recipientTag('bob'));
    expect(res.body).not.toContain('alice-uid-123');
    vi.unstubAllEnvs();
  });

  it('lets an anonymous Firebase user register', async () => {
    const res = await call('POST', DEVICE, as('anon-1', 'anon'));
    expect(res.status).toBe(200);
    expect(await listDevices('anon-1')).toHaveLength(1);
  });

  it('refuses an unauthenticated caller and stores nothing', async () => {
    const res = await call('POST', DEVICE, {});
    expect(res.status).toBe(401);
    expect(fake.docs.size).toBe(0);
  });

  it('refuses a service API key, which is not a person', async () => {
    const res = await call('POST', DEVICE, { 'x-api-key': 'service-key' });
    expect(res.status).toBe(403);
    expect(fake.docs.size).toBe(0);
  });

  it('rejects a body that is not an APNs registration', async () => {
    const res = await call('POST', { ...DEVICE, environment: 'staging' }, as('alice'));
    expect(res.status).toBe(400);
    expect(fake.docs.size).toBe(0);
  });

  it('answers 500, not success, when the store is down', async () => {
    fake.up = false;
    const res = await call('POST', DEVICE, as('alice'));
    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/push/devices', () => {
  beforeEach(() => resetFakeFirestore(fake));

  it('removes the caller’s own token', async () => {
    await call('POST', DEVICE, as('alice'));
    expect(await listDevices('alice')).toHaveLength(1);

    const res = await call('DELETE', { token: TOKEN }, as('alice'));

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ success: true, removed: true });
    expect(await listDevices('alice')).toEqual([]);
  });

  it("can't remove someone else's token", async () => {
    await call('POST', DEVICE, as('alice'));

    const res = await call('DELETE', { token: TOKEN }, as('mallory'));

    expect(JSON.parse(res.body)).toMatchObject({ removed: false });
    expect(await listDevices('alice')).toHaveLength(1);
  });

  it('needs a token', async () => {
    const res = await call('DELETE', {}, as('alice'));
    expect(res.status).toBe(400);
  });
});
