/**
 * When a contact store can't be read, the people panel and the export say so.
 *
 * Both contact services swallowed a failed Firestore read and returned [], so the panel
 * said "nobody here", the nudges said "no suggestions" and "Take your story" exported a
 * file with no contacts that looked complete. Now the panel routes answer 503, the export
 * stops with 503, a failed read is retried instead of cached as empty, and the agent's
 * context builders still degrade quietly. Real routes, real services; only Firestore is
 * replaced, by one that fails until told otherwise.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  down: true,
  /** Collections that fail even when the rest of the store is up */
  failing: new Set<string>(),
  reads: 0,
  docs: {} as Record<string, Array<Record<string, unknown>>>,
}));

vi.mock('@google-cloud/firestore', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const query = (name: string) => {
    const q = {
      where: () => q,
      orderBy: () => q,
      limit: () => q,
      get: async () => {
        store.reads++;
        if (store.down || store.failing.has(name))
          throw new Error('14 UNAVAILABLE: No connection established');
        const docs = (store.docs[name] ?? []).map((d) => ({ id: String(d.id), data: () => d }));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    };
    return q;
  };
  class Firestore {
    collection(name: string) {
      return {
        ...query(name),
        doc: () => ({ set: async () => undefined, delete: async () => undefined }),
      };
    }
  }
  return { ...actual, Firestore };
});
// The door verifies the caller and binds x-firebase-uid; that is not what this tests
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireAuth: vi.fn(async (req: { headers: Record<string, string> }) => ({
    userId: req.headers['x-firebase-uid'],
    isAdmin: false,
  })),
  rateLimit: vi.fn(() => false),
}));
vi.mock('../../services/platform/export-rate-limit.js', () => ({
  claimExport: vi.fn(async () => async () => undefined),
}));

let server: Server;
let base: string;
const newUser = (): string => `menu-people-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  const { handleContactsRoutes } = await import('../contacts-routes.js');
  const { handleDataRoutes } = await import('../routes/data.js');
  const { rememberVerifiedUid } = await import('../rate-limit-identity.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const uid = req.headers['x-firebase-uid'];
    rememberVerifiedUid(req, typeof uid === 'string' ? uid : null);
    void (async () => {
      if (await handleContactsRoutes(req, res, url.pathname, url)) return;
      if (await handleDataRoutes(req, res, url.pathname, url)) return;
      res.writeHead(404).end();
    })();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());
beforeEach(() => {
  store.down = true;
  store.failing.clear();
  store.docs = {};
});

async function call(uid: string, method: string, path: string, body?: object) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'x-firebase-uid': uid, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('a contact store that cannot be read', () => {
  it('the people list answers 503, not an empty list', async () => {
    const listed = await call(newUser(), 'GET', '/api/contacts');

    expect(listed.status).toBe(503);
    expect(listed.body.contacts).toBeUndefined();
  });

  it('relationship insights and nudges answer 503, not "nothing to suggest"', async () => {
    const uid = newUser();

    expect((await call(uid, 'GET', '/api/contacts/insights')).status).toBe(503);
    expect((await call(uid, 'GET', '/api/contacts/nudges')).status).toBe(503);
  });

  it('the export stops with 503 instead of a file with no contacts', async () => {
    const exported = await call(newUser(), 'POST', '/api/export', {
      format: 'json',
      categories: ['Contacts'],
    });

    expect(exported.status).toBe(503);
    expect(exported.body.reason).toBe('unavailable');
  });

  it('only the call-saved contacts failing is enough: the list and the export both say so', async () => {
    store.down = false;
    store.failing.add('user_contacts');
    const uid = newUser();

    expect((await call(uid, 'GET', '/api/contacts')).status).toBe(503);
    const exported = await call(uid, 'POST', '/api/export', {
      format: 'json',
      categories: ['Contacts'],
    });
    expect(exported.status).toBe(503);
  });

  it('a failed read is retried, not remembered as "nobody": the next open shows them', async () => {
    const uid = newUser();
    expect((await call(uid, 'GET', '/api/contacts')).status).toBe(503);

    store.down = false;
    const now = new Date().toISOString();
    store.docs.contact_relationships = [
      {
        id: 'r1',
        userId: uid,
        contactId: 'c1',
        name: 'Rosa Diaz',
        relationship: 'family',
        topics: [],
        recentContext: [],
        lastInteraction: now,
        firstInteraction: now,
        createdAt: now,
        updatedAt: now,
      },
    ];
    const listed = await call(uid, 'GET', '/api/contacts');

    expect(listed.status).toBe(200);
    expect((listed.body.contacts as Array<{ name: string }>).map((p) => p.name)).toEqual([
      'Rosa Diaz',
    ]);
  });

  it("the agent's context builder still degrades quietly: no throw, no injection", async () => {
    const { contactAwarenessBuilder } =
      await import('../../intelligence/context-builders/awareness/contact-awareness.js');
    const input = { persona: { id: 'alex-chen' }, userData: {}, services: { userId: newUser() } };
    const reads = store.reads;

    await expect(
      contactAwarenessBuilder.build(
        input as unknown as Parameters<typeof contactAwarenessBuilder.build>[0]
      )
    ).resolves.toEqual([]);
    expect(store.reads).toBeGreaterThan(reads); // it did try the store
  });

  it("the agent's contact read still answers [] (it degrades; the panel doesn't)", async () => {
    const { getContacts } = await import('../../services/contacts/contact-relationship-service.js');
    const { getUserContacts } =
      await import('../../services/identity/contacts/contacts-management.js');
    const uid = newUser();

    expect(await getContacts(uid)).toEqual([]);
    expect(await getUserContacts(uid)).toEqual([]);
  });
});
