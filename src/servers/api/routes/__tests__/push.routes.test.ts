/**
 * POST /api/push/subscribe must store the subscription where the senders look
 * (the push_subscriptions store behind getPushNotificationsService), keyed by
 * the VERIFIED caller, so sendNotification(uid) actually reaches that browser.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

// One fake Firestore-backed store per collection, shared across service instances
// the same way the real collection is shared across processes.
const collections = vi.hoisted(() => new Map<string, Map<string, unknown>>());

vi.mock('../../../../services/persistence/index.js', () => ({
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

vi.mock('../../../../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    const header = req.headers.authorization;
    const match = typeof header === 'string' ? header.match(/^Bearer verified-(.+)$/) : null;
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

import { handlePushRoutes } from '../push.js';
import PushNotificationsBackendService from '../../../../services/push-notifications.js';

const SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  platform: 'web',
};

function post(path: string, body: unknown, headers: Record<string, string>): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'POST';
  req.url = path;
  req.headers = headers;
  setTimeout(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
  return req;
}

function response(): ServerResponse & { statusCode: number } {
  const res = {
    statusCode: 0,
    writeHead: vi.fn(function (this: { statusCode: number }, status: number) {
      this.statusCode = status;
    }),
    setHeader: vi.fn(),
    end: vi.fn(),
  };
  return res as unknown as ServerResponse & { statusCode: number };
}

/** A sender in another process, recording which endpoints it pushed to. */
async function newSender(): Promise<{
  sender: PushNotificationsBackendService;
  delivered: string[];
}> {
  const sender = new PushNotificationsBackendService();
  await sender.initialize();
  const delivered: string[] = [];
  vi.spyOn(
    sender as unknown as { sendWebPush: (s: { endpoint: string }) => Promise<void> },
    'sendWebPush'
  ).mockImplementation(async (sub) => {
    delivered.push(sub.endpoint);
  });
  return { sender, delivered };
}

function subscribeAs(uid: string): Promise<boolean> {
  return handlePushRoutes(
    post('/api/push/subscribe', SUBSCRIPTION, { authorization: `Bearer verified-${uid}` }),
    response(),
    '/api/push/subscribe'
  );
}

const NOTE = { title: 'Your therapy notes', body: 'private', type: 'ferni_checkin' as const };

describe('push subscribe → sender lookup', () => {
  beforeEach(() => {
    // The route's singleton service keeps references to these maps; empty, don't replace.
    collections.forEach((docs) => docs.clear());
  });

  it('a subscribed user is found by the sender', async () => {
    // What the web client sends: its subscription plus the userId apiPost adds.
    const req = post(
      '/api/push/subscribe',
      { userId: 'uid-1', ...SUBSCRIPTION },
      {
        authorization: 'Bearer verified-uid-1',
      }
    );
    const res = response();

    await handlePushRoutes(req, res, '/api/push/subscribe');
    expect(res.statusCode).toBe(200);

    // A fresh sender (e.g. the outreach job in another process) reads the store.
    const sender = new PushNotificationsBackendService();
    await sender.initialize();
    const delivered: string[] = [];
    vi.spyOn(
      sender as unknown as { sendWebPush: (s: { endpoint: string }) => Promise<void> },
      'sendWebPush'
    ).mockImplementation(async (sub) => {
      delivered.push(sub.endpoint);
    });

    const sent = await sender.sendNotification('uid-1', {
      title: 'Hi',
      body: 'Checking in',
      type: 'ferni_checkin',
    });

    expect(sent).toBe(true);
    expect(delivered).toEqual([SUBSCRIPTION.endpoint]);
    expect(collections.get('push_subscriptions')?.has('anonymous')).toBe(false);
  });

  it('keys the subscription by the verified caller, not a userId in the body', async () => {
    const req = post(
      '/api/push/subscribe',
      { ...SUBSCRIPTION, userId: 'victim' },
      {
        authorization: 'Bearer verified-uid-2',
      }
    );
    await handlePushRoutes(req, response(), '/api/push/subscribe');

    const store = collections.get('push_subscriptions')!;
    expect(store.has('uid-2')).toBe(true);
    expect(store.has('victim')).toBe(false);
  });

  it('rejects an unauthenticated subscribe', async () => {
    const res = response();
    await handlePushRoutes(
      post('/api/push/subscribe', SUBSCRIPTION, {}),
      res,
      '/api/push/subscribe'
    );

    expect(res.statusCode).toBe(401);
    expect(collections.get('push_subscriptions')?.size ?? 0).toBe(0);
  });

  it('unsubscribe removes it from the store the sender reads', async () => {
    const headers = { authorization: 'Bearer verified-uid-3' };
    await handlePushRoutes(
      post('/api/push/subscribe', SUBSCRIPTION, headers),
      response(),
      '/api/push/subscribe'
    );
    const res = response();
    await handlePushRoutes(
      post('/api/push/unsubscribe', { endpoint: SUBSCRIPTION.endpoint }, headers),
      res,
      '/api/push/unsubscribe'
    );

    expect(res.statusCode).toBe(200);
    const sender = new PushNotificationsBackendService();
    await sender.initialize();
    expect(await sender.sendNotification('uid-3', { title: 't', body: 'b', type: 'general' })).toBe(
      false
    );
  });

  it('a send without web-push installed is reported as not sent', async () => {
    await handlePushRoutes(
      post('/api/push/subscribe', SUBSCRIPTION, { authorization: 'Bearer verified-uid-4' }),
      response(),
      '/api/push/subscribe'
    );
    const sender = new PushNotificationsBackendService();
    await sender.initialize();

    // web-push is not a dependency of this repo, so the real sendWebPush can't deliver.
    expect(await sender.sendNotification('uid-4', { title: 't', body: 'b', type: 'general' })).toBe(
      false
    );
  });

  describe('one browser, two accounts', () => {
    it("after B subscribes the same endpoint, A's notifications no longer reach it", async () => {
      await subscribeAs('alice');
      await subscribeAs('bob');
      const { sender, delivered } = await newSender();

      expect(await sender.sendNotification('alice', NOTE)).toBe(false);
      expect(delivered).toEqual([]);

      expect(await sender.sendNotification('bob', NOTE)).toBe(true);
      expect(delivered).toEqual([SUBSCRIPTION.endpoint]);
    });

    it("a sender that cached A's subscriptions earlier doesn't keep using them", async () => {
      await subscribeAs('alice');
      const { sender, delivered } = await newSender();
      expect(await sender.sendNotification('alice', NOTE)).toBe(true); // warms any cache

      await subscribeAs('bob'); // the API server moves the endpoint
      delivered.length = 0;

      expect(await sender.sendNotification('alice', NOTE)).toBe(false);
      expect(delivered).toEqual([]);
    });

    it("A's unsubscribe (sign-out) doesn't take the endpoint away from B", async () => {
      await subscribeAs('alice');
      await subscribeAs('bob');
      await handlePushRoutes(
        post(
          '/api/push/unsubscribe',
          { endpoint: SUBSCRIPTION.endpoint },
          {
            authorization: 'Bearer verified-alice',
          }
        ),
        response(),
        '/api/push/unsubscribe'
      );
      const { sender, delivered } = await newSender();

      expect(await sender.sendNotification('bob', NOTE)).toBe(true);
      expect(delivered).toEqual([SUBSCRIPTION.endpoint]);
    });
  });
});
