/**
 * A retired wearable (Fitbit: its Web API shut down 2026-10-30..11-02) can't be linked any
 * more, but people who linked it still have a sealed token doc. POST /wearables/fitbit/unlink
 * stays as a delete-only path: the verified caller deletes their own doc, nobody else's,
 * and nothing calls the dead API.
 *
 * Real HTTP through bindVerifiedIdentity, the REAL wearables route and token module, on the
 * Firestore merge fake. Mocked: Firebase token verification only.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@google-cloud/firestore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));
vi.mock('../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-')
      ? { uid: `uid-${token.slice(4)}`, claims: {}, isAnonymous: false }
      : null
  ),
}));

const state = newMergeFakeState();
fake.db = createMergeFakeFirestore(state);

const { bindVerifiedIdentity } = await import('../request-identity.js');
const { handleWearablesRoutes } = await import('../routes/wearables.js');

const docOf = (uid: string) => `bogle_users/${uid}/wearable_fitbit_tokens/data`;
const realFetch = globalThis.fetch;
const fetchSpy = vi.spyOn(globalThis, 'fetch');
let base = '';
let server: Server;

beforeAll(async () => {
  server = createServer((req, res) => {
    void (async () => {
      await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (await handleWearablesRoutes(req, res, url.pathname, url)) return;
      res.writeHead(404);
      res.end();
    })();
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
  state.docs.clear();
  state.writes.length = 0;
  state.docs.set(docOf('uid-A'), { encrypted: 'sealed', provider: 'fitbit', updated_at: 1 });
  fetchSpy.mockClear();
});

const unlink = (token: string | null, query = '') =>
  realFetch(`${base}/wearables/fitbit/unlink${query}`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

/** Calls the route made, not the test's own requests to the local server. */
const outboundCalls = () =>
  fetchSpy.mock.calls.filter(([input]) => !String(input).startsWith(base));

describe('POST /wearables/fitbit/unlink (retired provider, delete-only)', () => {
  it("the owner's unlink deletes their token doc, with no call to the provider", async () => {
    expect(state.docs.has(docOf('uid-A'))).toBe(true);

    const res = await unlink('tok-A');

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
    expect(state.docs.has(docOf('uid-A'))).toBe(false);
    expect(state.writes).toEqual([{ path: docOf('uid-A'), op: 'delete' }]);
    expect(outboundCalls()).toEqual([]);
  });

  it("another user can't delete it, even naming the owner", async () => {
    const res = await unlink('tok-B', '?user_id=uid-A&userId=uid-A');

    expect(res.status).toBe(200); // B's own (absent) doc
    expect(state.docs.has(docOf('uid-A'))).toBe(true);
    expect(state.writes.map((w) => w.path)).not.toContain(docOf('uid-A'));
  });

  it('signed out: 401 and nothing deleted', async () => {
    const res = await unlink(null, '?user_id=uid-A');

    expect(res.status).toBe(401);
    expect(state.docs.has(docOf('uid-A'))).toBe(true);
    expect(state.writes).toEqual([]);
  });

  it('the retired provider has no login or callback any more', async () => {
    for (const path of ['/wearables/fitbit/login', '/wearables/fitbit/callback']) {
      const res = await realFetch(`${base}${path}`, { redirect: 'manual' });
      expect(res.status, path).toBe(404);
    }
  });
});
