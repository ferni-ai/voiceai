/**
 * Developer-console sign-in links a Firebase account to a publisher only for a
 * verified, non-anonymous email, and never re-points a publisher that already
 * belongs to another account.
 *
 * POST /api/v1/developers/auth/verify matched publishers by email without
 * checking email_verified, and anonymous tokens (no email) all matched the
 * same email:'' publisher. Real route; Firebase Admin, Firestore and key
 * issuance are in-memory fakes.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Claims = {
  uid: string;
  email?: string;
  email_verified?: boolean;
  firebase?: { sign_in_provider?: string };
};
const tokens = vi.hoisted(() => new Map<string, Claims>());
vi.mock('firebase-admin/app', () => ({
  getApps: () => [{}],
  initializeApp: vi.fn(),
  applicationDefault: vi.fn(),
  cert: vi.fn(),
}));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => {
      const claims = tokens.get(t);
      if (!claims) throw new Error('invalid token');
      return claims;
    },
  }),
}));

const publishers = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('@google-cloud/firestore', () => {
  const snapshot = (id: string) => ({
    id,
    exists: publishers.has(id),
    data: () => publishers.get(id),
  });
  class Firestore {
    collection() {
      const query = (field: string, value: unknown) => ({
        limit: () => query(field, value),
        get: async () => {
          const docs = [...publishers.keys()]
            .filter((id) => publishers.get(id)![field] === value)
            .map(snapshot);
          return { empty: docs.length === 0, docs, size: docs.length };
        },
      });
      return {
        where: (field: string, _op: string, value: unknown) => query(field, value),
        doc: (id: string) => ({
          id,
          get: async () => snapshot(id),
          set: async (data: Record<string, unknown>) => {
            publishers.set(id, { ...publishers.get(id), ...data });
          },
        }),
      };
    }
  }
  return { Firestore };
});

const registerPublisher = vi.hoisted(() =>
  vi.fn(async (email: string, name: string) => {
    const id = `pub-${publishers.size + 1}`;
    publishers.set(id, { email, name, verified: false });
    return { publisher: { id, email, name, verified: false, createdAt: new Date() }, apiKey: 'k' };
  })
);
vi.mock('../publisher-auth.js', () => ({
  registerPublisher,
  getPublisher: vi.fn(),
  listApiKeys: async () => [],
}));

const { handleDeveloperAuthRoutes } = await import('../v1/developers/auth-routes.js');
const { getPublisherFromToken } = await import('../v1/developers/shared/developer-auth.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    void handleDeveloperAuthRoutes(req, res, new URL(req.url || '/', 'http://x').pathname);
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  () =>
    new Promise<void>((r) => {
      server.close(() => r());
    })
);

beforeEach(() => {
  vi.clearAllMocks();
  tokens.clear();
  publishers.clear();
  publishers.set('pub-victim', {
    email: 'dev@example.com',
    name: 'Dev',
    verified: true,
    firebaseUid: 'uid-victim',
  });
  publishers.set('pub-legacy', { email: 'legacy@example.com', name: 'Legacy', verified: false });
  // The record every anonymous sign-in used to collapse onto
  publishers.set('pub-shared', { email: '', name: 'Developer', verified: false, firebaseUid: 'x' });
});

const verify = (token: string, claims: Claims) => {
  tokens.set(token, claims);
  return fetch(`${base}/api/v1/developers/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: token }),
  });
};

describe('POST /api/v1/developers/auth/verify', () => {
  it("refuses an unverified email that matches someone's publisher", async () => {
    const res = await verify('t1', { uid: 'uid-attacker', email: 'dev@example.com' });
    expect(res.status).toBe(403);
    expect(publishers.get('pub-victim')!.firebaseUid).toBe('uid-victim');
  });

  it('refuses an anonymous account', async () => {
    const res = await verify('t2', {
      uid: 'uid-anon',
      firebase: { sign_in_provider: 'anonymous' },
    });
    expect(res.status).toBe(403);
    expect(publishers.get('pub-shared')!.firebaseUid).toBe('x');
    expect(registerPublisher).not.toHaveBeenCalled();
  });

  it('refuses a token with no email', async () => {
    const res = await verify('t3', { uid: 'uid-phone', firebase: { sign_in_provider: 'phone' } });
    expect(res.status).toBe(403);
    expect(registerPublisher).not.toHaveBeenCalled();
  });

  it('never re-points a publisher already linked to another account', async () => {
    const res = await verify('t4', {
      uid: 'uid-attacker',
      email: 'dev@example.com',
      email_verified: true,
    });
    expect(res.status).toBe(409);
    expect(publishers.get('pub-victim')!.firebaseUid).toBe('uid-victim');
  });

  it('signs the owner back in to their publisher', async () => {
    const res = await verify('t5', {
      uid: 'uid-victim',
      email: 'dev@example.com',
      email_verified: true,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).session.publisherId).toBe('pub-victim');
  });

  it('links a verified email to a legacy publisher with no account yet', async () => {
    const res = await verify('t6', {
      uid: 'uid-legacy',
      email: 'legacy@example.com',
      email_verified: true,
    });
    expect(res.status).toBe(200);
    expect(publishers.get('pub-legacy')!.firebaseUid).toBe('uid-legacy');
  });

  it('creates a publisher for a new verified email', async () => {
    const res = await verify('t7', {
      uid: 'uid-new',
      email: 'new@example.com',
      email_verified: true,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isNewAccount).toBe(true);
    expect(registerPublisher).toHaveBeenCalledWith('new@example.com', 'new');
  });
});

describe('getPublisherFromToken', () => {
  const req = (token: string) =>
    ({
      headers: { authorization: `Bearer ${token}` },
    }) as unknown as import('http').IncomingMessage;
  const jwt = (tag: string) => `${'a'.repeat(60)}.${tag}${'b'.repeat(60)}.sig`;

  it('does not resolve an anonymous account to a publisher, even one linked earlier', async () => {
    tokens.set(jwt('anon'), { uid: 'x', firebase: { sign_in_provider: 'anonymous' } });
    expect(await getPublisherFromToken(req(jwt('anon')))).toBeNull();
  });

  it('resolves a signed-in account to its linked publisher', async () => {
    tokens.set(jwt('dev'), { uid: 'uid-victim', firebase: { sign_in_provider: 'google.com' } });
    expect(await getPublisherFromToken(req(jwt('dev')))).toBe('pub-victim');
  });
});
