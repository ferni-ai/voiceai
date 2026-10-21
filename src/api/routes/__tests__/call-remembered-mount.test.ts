/**
 * /api/memories/from-call through the engagement router with real token
 * verification (Firebase mocked): an anonymous Firebase user gets their own
 * items, and a forged identity header gets nothing.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-A' ? { uid: 'uid-A', claims: { admin: false }, isAnonymous: true } : null
  ),
}));
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
const reads = vi.hoisted(() => ({ users: [] as string[] }));
const learnedAt = vi.hoisted(() => new Date().toISOString());
vi.mock('../../../memory/storage/memory-control-store.js', () => ({
  firestoreMemoryControlStore: {
    forgotten: async () => [],
    facts: async (uid: string) => {
      reads.users.push(uid);
      return [
        {
          id: 'f1',
          data: {
            entityName: 'user',
            key: 'dog name',
            value: 'Biscuit',
            confidence: 0.9,
            extractedAt: learnedAt,
          },
        },
      ];
    },
  },
}));

const { handleEngagementRoutes } = await import('../../engagement-routes.js');

let server: Server;
let base = '';
beforeAll(async () => {
  vi.stubEnv('MEMORY_VIEW', 'on');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleEngagementRoutes(req, res, url.pathname, url).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((r) => {
    server.close(() => r());
  });
});

describe('GET /api/memories/from-call through the engagement router', () => {
  const since = () => Date.now() - 60_000;

  it('answers an anonymous Firebase user with their own items', async () => {
    reads.users.length = 0;
    const res = await fetch(`${base}/api/memories/from-call?since=${since()}&userId=uid-B`, {
      headers: { authorization: 'Bearer tok-A', 'x-user-id': 'uid-B' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [{ id: 'f1', subject: 'you', detail: 'dog name: Biscuit', learnedAt }],
    });
    expect(new Set(reads.users)).toEqual(new Set(['uid-A']));
  });

  it('is 401 for a forged identity header with no valid token', async () => {
    reads.users.length = 0;
    const res = await fetch(`${base}/api/memories/from-call?since=${since()}`, {
      headers: { 'x-firebase-uid': 'uid-A', authorization: 'Bearer forged' },
    });
    expect(res.status).toBe(401);
    expect(reads.users).toEqual([]);
  });
});
