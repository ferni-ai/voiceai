/**
 * DELETE /api/account also removes the records kept about the user outside
 * their own documents, which the deleteAllData sweep never reached:
 * - push subscriptions (bogle_users/<uid>/push_subscriptions/data) and the
 *   push_endpoint_owners records naming them;
 * - OAuth link states they started;
 * - apple_transaction_owners records naming them, replaced by tombstones that
 *   keep no raw uid (deleting them would free the purchase for a first claim).
 * Each is best effort: a failure is logged and listed in details.failures,
 * never hidden behind a plain success.
 *
 * Real route, real sweep functions and the real OAuth link-state stores;
 * Firestore is an in-memory fake, and the token verifier, deleteAllData and
 * Firebase user deletion are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

// ---------------------------------------------------------------------------
// In-memory Firestore: documents by path, plus the calls the sweeps make.
// ---------------------------------------------------------------------------
const fs = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  failCollection: null as string | null,
}));

vi.mock('../../utils/firestore-utils.js', async (importOriginal) => {
  type Data = Record<string, unknown>;
  const ref = (path: string) => ({
    id: path.split('/').pop() ?? '',
    path,
    get: async () => ({ exists: fs.docs.has(path), data: () => fs.docs.get(path) }),
    set: async (data: Data) => {
      fs.docs.set(path, data);
    },
    delete: async () => {
      fs.docs.delete(path);
    },
  });
  const collection = (name: string) => ({
    doc: (id: string) => ref(`${name}/${id}`),
    where: (field: string, _op: '==', value: unknown) => ({
      get: async () => {
        if (fs.failCollection === name) throw new Error(`${name} unavailable`);
        const docs = [...fs.docs]
          .filter(([path, data]) => {
            const rest = path.slice(name.length + 1);
            return path.startsWith(`${name}/`) && !rest.includes('/') && data[field] === value;
          })
          .map(([path, data]) => ({ id: ref(path).id, ref: ref(path), data: () => data }));
        return { empty: docs.length === 0, size: docs.length, docs };
      },
    }),
  });
  const db = {
    collection,
    doc: ref,
    batch: () => {
      const pending: Array<() => Promise<void>> = [];
      return {
        delete: (r: { delete: () => Promise<void> }) => pending.push(() => r.delete()),
        commit: async () => {
          for (const op of pending) await op();
        },
      };
    },
  };
  return {
    ...(await importOriginal<typeof import('../../utils/firestore-utils.js')>()),
    getFirestoreDb: () => db,
  };
});

vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    const header = req.headers.authorization;
    const match = typeof header === 'string' ? header.match(/^Bearer verified-(.+)$/) : null;
    if (!match) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return null;
    }
    return { userId: match[1], firebaseUid: match[1], isAdmin: false, authMethod: 'firebase' };
  }),
  rateLimit: vi.fn(() => false),
}));

vi.mock('../../services/data-export.js', () => ({
  getDataExportService: () => ({ deleteAllData: vi.fn(async () => undefined) }),
}));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  deleteFirebaseUser: vi.fn(async () => true),
  getFirebaseUser: vi.fn(),
}));
vi.mock('../../services/security-events.js', () => ({
  recordSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../memory/index.js', () => ({ getDefaultStore: vi.fn() }));

const { handleAccountRoutes } = await import('../account-routes.js');
const linkState = await import('../../servers/token/oauth-link-state.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function deleteRequest(uid: string): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'DELETE';
  req.url = '/api/account';
  req.headers = { authorization: `Bearer verified-${uid}` };
  (req as unknown as { socket: unknown }).socket = { remoteAddress: '127.0.0.1' };
  setTimeout(() => {
    req.emit('data', Buffer.from(JSON.stringify({ confirmation: 'DELETE_MY_ACCOUNT' })));
    req.emit('end');
  }, 0);
  return req;
}

interface Sent {
  status: number;
  body: { success?: boolean; message?: string; details?: { failures?: string[] } };
}

async function deleteAccount(uid: string): Promise<Sent> {
  const sent: Sent = { status: 200, body: {} };
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((status: number) => {
      sent.status = status;
    }),
    end: vi.fn((data?: string) => {
      sent.body = JSON.parse(data || '{}') as Sent['body'];
    }),
  } as unknown as ServerResponse;
  await handleAccountRoutes(deleteRequest(uid), res, '/api/account');
  return sent;
}

/** Start an OAuth link flow for `uid` the way /api/oauth/start does; returns its state. */
async function startLink(uid: string): Promise<string> {
  const req = { headers: {} } as IncomingMessage;
  const res = { setHeader: vi.fn() } as unknown as ServerResponse;
  const state = await linkState.createOAuthLinkState(req, res, {
    uid,
    provider: 'google-calendar',
    returnUrl: '/',
  });
  if (!state) throw new Error('could not start link flow');
  return state;
}

/** Seed push, Apple and OAuth records for one user. */
async function seed(uid: string): Promise<string> {
  fs.docs.set(`bogle_users/${uid}/push_subscriptions/data`, {
    subscriptions: [{ endpoint: `https://push.example/${uid}`, userId: uid }],
  });
  fs.docs.set(`push_endpoint_owners/hash-${uid}`, { userId: uid, keysHash: 'k' });
  fs.docs.set(`apple_transaction_owners/otx-${uid}`, { userId: uid, claimedAt: 'then' });
  return startLink(uid);
}

const live = (state: string) => linkState.peekOAuthLinkState(state, 'google-calendar');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
for (const storeKind of ['memory', 'firestore'] as const) {
  describe(`DELETE /api/account linked records (${storeKind} OAuth state store)`, () => {
    beforeEach(() => {
      fs.docs.clear();
      fs.failCollection = null;
      if (storeKind === 'firestore') vi.stubEnv('OAUTH_STATE_STORE', 'firestore');
      linkState.setOAuthLinkStore(null);
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      linkState.setOAuthLinkStore(null);
    });

    it("removes A's push, OAuth and Apple records and leaves B's alone", async () => {
      const stateA = await seed('alice');
      const stateB = await seed('bob');
      expect(await live(stateA)).not.toBeNull();

      const sent = await deleteAccount('alice');

      expect(fs.docs.has('bogle_users/alice/push_subscriptions/data')).toBe(false);
      expect(fs.docs.has('push_endpoint_owners/hash-alice')).toBe(false);
      const tomb = fs.docs.get('apple_transaction_owners/otx-alice');
      expect(tomb?.userId).toBeNull(); // tombstoned, not freed for someone's first claim
      expect(tomb?.deletedAt).toEqual(expect.any(String));
      expect(JSON.stringify(tomb)).not.toContain('alice');
      expect(await live(stateA)).toBeNull();

      expect(fs.docs.has('bogle_users/bob/push_subscriptions/data')).toBe(true);
      expect(fs.docs.has('push_endpoint_owners/hash-bob')).toBe(true);
      expect(fs.docs.get('apple_transaction_owners/otx-bob')?.userId).toBe('bob');
      expect((await live(stateB))?.uid).toBe('bob');

      expect(sent.status).toBe(200);
      expect(sent.body.success).toBe(true);
      expect(sent.body.details?.failures).toEqual([]);
    });
  });
}

describe('DELETE /api/account when a linked sweep fails', () => {
  beforeEach(() => {
    fs.docs.clear();
    linkState.setOAuthLinkStore(null);
  });
  afterEach(() => {
    fs.failCollection = null;
  });

  it('still deletes the account and the other records, and reports what was left', async () => {
    await seed('alice');
    fs.failCollection = 'apple_transaction_owners';

    const sent = await deleteAccount('alice');

    expect(sent.status).toBe(200);
    expect(sent.body.success).toBe(true);
    expect(sent.body.details?.failures).toEqual(['apple_transaction_owners']);
    expect(sent.body.message).toMatch(/couldn't be removed/);
    expect(fs.docs.has('push_endpoint_owners/hash-alice')).toBe(false);
    expect(fs.docs.get('apple_transaction_owners/otx-alice')?.userId).toBe('alice');
  });
});
