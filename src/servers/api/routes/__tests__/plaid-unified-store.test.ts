/**
 * PLAID_UNIFIED_STORE: a bank linked on the web is one sealed record that the
 * agent reads from its own process.
 *
 * Runs the real /plaid/exchange route, the real persistence layer and the
 * shared sealed store over the Firestore fake. Only Plaid's HTTP exchange, auth
 * and the old `.plaid-tokens.json` file store are stand-ins. Every fixture is
 * fictional.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
} from '../../../../tests/helpers/merge-fake-firestore.js';

const h = vi.hoisted(() => {
  const calls: unknown[][] = [];
  const fn = (...args: unknown[]) => void calls.push(args);
  const logger = { debug: fn, info: fn, warn: fn, error: fn, trace: fn, fatal: fn };
  const file = new Map<string, { access_token: string; item_id: string }>();
  return { calls, logger: { ...logger, child: () => logger }, db: null as unknown, file };
});

vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createLogger: () => h.logger,
  getLogger: () => h.logger,
}));
// The sealed store reads the raw doc back (getFirestoreDb, the same Firestore); setup.ts stubs it.
vi.mock('../../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => h.db,
}));
vi.mock('@google-cloud/firestore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Firestore: class {
    constructor() {
      return h.db as object;
    }
  },
}));
vi.mock('../../../../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: IncomingMessage) => {
    const m = String(req.headers.authorization ?? '').match(/^Bearer verified-(.+)$/);
    return m ? { userId: m[1], isAdmin: false } : null;
  }),
  rateLimit: vi.fn(() => false),
}));
// The old file store, so the flag-off path is observable without touching cwd.
vi.mock('../../../../tools/domains/finance/plaid-store.js', () => ({
  storeAccessToken: vi.fn((uid: string, access_token: string, item_id = '') =>
    h.file.set(uid, { access_token, item_id })
  ),
  getStoredAccessToken: vi.fn((uid: string) => h.file.get(uid)?.access_token ?? null),
  hasLinkedAccounts: vi.fn((uid: string) => h.file.has(uid)),
  getTokenData: vi.fn((uid: string) => h.file.get(uid) ?? null),
  removeAccessToken: vi.fn((uid: string) => h.file.delete(uid)),
}));

process.env.PLAID_CLIENT_ID = 'fixture-client-id';
process.env.PLAID_SECRET = 'fixture-secret';

const A = 'user-a-0001-fictional';
const B = 'user-b-0002-fictional';
const ACCESS_A = 'access-sandbox-fixture-aaaa';
const ACCESS_A2 = 'access-sandbox-fixture-a2a2';
const ACCESS_B = 'access-sandbox-fixture-bbbb';
const TOKENS = [ACCESS_A, ACCESS_A2, ACCESS_B];
const docPath = (uid: string) => `bogle_users/${uid}/plaid_tokens/data`;
const KEY_VARS = ['TOKEN_SEALING_KEY', 'OAUTH_ENCRYPTION_KEY', 'LOG_HASH_SECRET'] as const;

const state = newMergeFakeState();
h.db = createMergeFakeFirestore(state);

/** Plaid's /item/public_token/exchange answers with this access token and item id. */
let plaidAnswer = { access_token: ACCESS_A, item_id: 'item-a-1' };

function exchangeRequest(uid: string): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'POST';
  req.url = '/plaid/exchange';
  req.headers = { authorization: `Bearer verified-${uid}` };
  setTimeout(() => {
    const body = { public_token: 'public-sandbox-fixture', user_id: uid };
    req.emit(
      'data',
      Buffer.from(JSON.stringify({ ...body, institution: { name: 'Fictional CU' } }))
    );
    req.emit('end');
  }, 0);
  return req;
}

async function exchange(uid: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const { handlePlaidRoutes } = await import('../plaid.js');
  let status = 0;
  let raw = '';
  const res = {
    headersSent: false,
    writeHead: (s: number) => void (status = s),
    end: (b: string) => void (raw = b),
  } as unknown as ServerResponse;
  await handlePlaidRoutes(exchangeRequest(uid), res, '/plaid/exchange', new URL('http://x'));
  return { status, body: JSON.parse(raw) as Record<string, unknown> };
}

/** The agent's container: fresh modules, nothing cached, only Firestore shared. */
async function agentProcess() {
  vi.resetModules();
  return import('../../../../tools/domains/finance/plaid-items.js');
}

const opened = async (uid: string) => {
  const { decryptData } = await import('../../../../utils/token-encryption.js');
  const doc = state.docs.get(docPath(uid)) as { encrypted: string };
  return decryptData<{ items: Array<Record<string, unknown>> }>(doc.encrypted);
};

beforeEach(() => {
  vi.resetModules();
  state.docs.clear();
  state.writes.length = 0;
  state.failWrites.clear();
  state.failReads = new Set();
  state.versions.clear();
  h.file.clear();
  h.calls.length = 0;
  for (const k of KEY_VARS) delete process.env[k];
  process.env.OAUTH_ENCRYPTION_KEY = 'fixture-encryption-key';
  process.env.PLAID_UNIFIED_STORE = 'on';
  plaidAnswer = { access_token: ACCESS_A, item_id: 'item-a-1' };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => plaidAnswer }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.PLAID_UNIFIED_STORE;
  // No access token reaches a log line.
  const logged = JSON.stringify(h.calls, (_k, v: unknown) => (v instanceof Error ? v.message : v));
  for (const t of TOKENS) expect(logged).not.toContain(t);
});

describe('flag on: one sealed record per user', () => {
  it('exchange stores a sealed record with no plaintext access token', async () => {
    expect(state.docs.has(docPath(A))).toBe(false);

    const { status, body } = await exchange(A);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    const raw = state.docs.get(docPath(A));
    expect(raw).toBeDefined();
    expect(JSON.stringify(raw)).not.toContain(ACCESS_A);
    expect(JSON.parse((raw as { encrypted: string }).encrypted)).toMatchObject({ encrypted: true });
    expect((await opened(A))?.items).toEqual([
      expect.objectContaining({
        access_token: ACCESS_A,
        item_id: 'item-a-1',
        institution: { name: 'Fictional CU' },
        status: 'connected',
        linked_at: expect.any(String),
      }),
    ]);
    expect(h.file.size).toBe(0);
  });

  it('the agent reads it for that user only', async () => {
    await exchange(A);
    const agent = await agentProcess();

    expect(await agent.getStoredAccessToken(A)).toBe(ACCESS_A);
    expect(await agent.hasLinkedAccounts(B)).toBe(false);
    expect(await agent.getStoredAccessToken(B)).toBeNull();

    plaidAnswer = { access_token: ACCESS_B, item_id: 'item-b-1' };
    await exchange(B);
    const later = await agentProcess();
    expect(await later.getStoredAccessToken(B)).toBe(ACCESS_B);
    expect(await later.getStoredAccessToken(A)).toBe(ACCESS_A);
    expect((await opened(A))?.items.map((i) => i.item_id)).toEqual(['item-a-1']);
  });

  it('a second bank adds an Item; relinking the same Item replaces it', async () => {
    await exchange(A);
    plaidAnswer = { access_token: ACCESS_A2, item_id: 'item-a-2' };
    await exchange(A);
    expect((await opened(A))?.items.map((i) => i.item_id)).toEqual(['item-a-1', 'item-a-2']);

    plaidAnswer = { access_token: ACCESS_A, item_id: 'item-a-2' };
    await exchange(A);
    const items = (await opened(A))?.items ?? [];
    expect(items.map((i) => [i.item_id, i.access_token])).toEqual([
      ['item-a-1', ACCESS_A],
      ['item-a-2', ACCESS_A],
    ]);
  });

  it('reads a single link the flag-off route wrote as one Item', async () => {
    process.env.PLAID_UNIFIED_STORE = 'off';
    await exchange(A);
    process.env.PLAID_UNIFIED_STORE = 'on';
    const agent = await agentProcess();
    expect(await agent.getTokenData(A)).toMatchObject({
      access_token: ACCESS_A,
      item_id: 'item-a-1',
    });
  });
});

describe('flag on: refusals are reported, not "connected"', () => {
  it('no token key: nothing stored, typed refusal, route fails', async () => {
    for (const k of KEY_VARS) delete process.env[k];

    const { status, body } = await exchange(A);

    expect(status).toBe(503);
    expect(body).toEqual({ error: 'Bank account could not be saved', code: 'sealing_unavailable' });
    expect(state.writes).toEqual([]);
    expect(state.docs.size).toBe(0);
    const agent = await agentProcess();
    expect(await agent.storeAccessToken(A, ACCESS_A, 'item-a-1')).toEqual({
      ok: false,
      code: 'sealing_unavailable',
    });
    expect(await agent.hasLinkedAccounts(A)).toBe(false);
  });

  it('a record that cannot be read is not overwritten (store_failed)', async () => {
    await exchange(A);
    const before = structuredClone(state.docs.get(docPath(A)));
    const writes = state.writes.length;
    state.failReads = new Set([docPath(A)]);
    plaidAnswer = { access_token: ACCESS_A2, item_id: 'item-a-2' };

    const { status, body } = await exchange(A);

    expect(status).toBe(503);
    expect(body.code).toBe('store_failed');
    expect(state.writes.length).toBe(writes);
    expect(state.docs.get(docPath(A))).toEqual(before);
  });
});

describe('flag on: disconnect and erasure', () => {
  it('disconnect drops the record; another process sees it gone within a minute', async () => {
    await exchange(A);
    const reader = await agentProcess();
    expect(await reader.hasLinkedAccounts(A)).toBe(true); // cached in the reader now

    const disconnector = await agentProcess(); // the web server, say
    expect(await disconnector.removeAccessToken(A)).toBe(true);
    expect(state.docs.has(docPath(A))).toBe(false);
    expect(await disconnector.removeAccessToken(A)).toBe(false);
    expect(await reader.hasLinkedAccounts(A)).toBe(true); // still cached

    vi.useFakeTimers({ now: Date.now() + 61_000 });
    expect(await reader.hasLinkedAccounts(A)).toBe(false);
  });

  it('a delete that does not land is reported as not removed', async () => {
    await exchange(A);
    state.failWrites.add(docPath(A));
    const agent = await agentProcess();

    expect(await agent.removeAccessToken(A)).toBe(false);
    expect(state.docs.has(docPath(A))).toBe(true);
  });
});

describe('flag off: the old path, unchanged', () => {
  it('route writes the old single-token doc; the agent reads only the file', async () => {
    process.env.PLAID_UNIFIED_STORE = 'off';

    const { status, body } = await exchange(A);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    const raw = state.docs.get(docPath(A)) as Record<string, unknown>;
    expect(Object.keys(raw)).not.toContain('needs_reauth');
    expect((await opened(A)) as unknown).toMatchObject({ access_token: ACCESS_A });
    const agent = await agentProcess();
    expect(await agent.getStoredAccessToken(A)).toBeNull(); // the file never saw the web link
    expect(await agent.storeAccessToken(B, ACCESS_B, 'item-b-1')).toEqual({ ok: true });
    expect(h.file.get(B)).toEqual({ access_token: ACCESS_B, item_id: '' }); // as main: no Item id
    expect(state.docs.has(docPath(B))).toBe(false);
  });

  it('a failed write answers as main does and is still retried by the old store', async () => {
    process.env.PLAID_UNIFIED_STORE = 'off';
    state.failWrites.add(docPath(A));

    const { status } = await exchange(A);

    expect(status).toBe(200); // as main: the old path does not confirm the write
    expect(state.docs.has(docPath(A))).toBe(false);
    state.failWrites.clear();
    await vi.waitFor(() => expect(state.docs.has(docPath(A))).toBe(true), { timeout: 6000 });
    expect((await opened(A)) as unknown).toMatchObject({ access_token: ACCESS_A });
  }, 15_000);
});

/** An envelope sealed under a key this process does not hold. */
async function sealedUnderOtherKey(value: unknown): Promise<string> {
  process.env.OAUTH_ENCRYPTION_KEY = 'fixture-other-key';
  vi.resetModules();
  const { encryptData } = await import('../../../../utils/token-encryption.js');
  const sealed = encryptData(value);
  process.env.OAUTH_ENCRYPTION_KEY = 'fixture-encryption-key';
  vi.resetModules();
  return sealed;
}

describe('flag on: a stored record that will not open is never overwritten', () => {
  const cases: Array<[string, () => Promise<Record<string, unknown>>]> = [
    [
      'sealed under another key',
      async () => ({
        encrypted: await sealedUnderOtherKey({
          items: [
            { access_token: ACCESS_A2, item_id: 'item-a-2', institution: {}, linked_at: 'x' },
          ],
        }),
      }),
    ],
    ['garbage in place of the envelope', async () => ({ encrypted: '{not json' })],
  ];
  for (const [name, doc] of cases) {
    it(`${name}: route fails with record_unreadable, doc unchanged`, async () => {
      state.docs.set(docPath(A), await doc());
      const before = structuredClone(state.docs.get(docPath(A)));

      const { status, body } = await exchange(A);

      expect(status).toBe(503);
      expect(body).toEqual({ error: 'Bank account could not be saved', code: 'record_unreadable' });
      expect(state.writes).toEqual([]);
      expect(state.docs.get(docPath(A))).toEqual(before);
    });
  }
});

describe('flag on: a write that does not land is not "connected", and is retried', () => {
  it('first link: route fails; the sealed store retries it on its own interval', async () => {
    state.failWrites.add(docPath(A));

    const { status, body } = await exchange(A);

    expect(status).toBe(503);
    expect(body.code).toBe('store_failed');
    expect(body.success).toBeUndefined();
    expect(state.docs.has(docPath(A))).toBe(false);
    const { getIntervalStats } = await import('../../../../utils/interval-manager.js');
    expect(getIntervalStats().map((s) => s.name)).toContain('persistence-sync-plaid_tokens');
    state.failWrites.clear();
    await vi.waitFor(() => expect(state.docs.has(docPath(A))).toBe(true), { timeout: 6000 });
    expect((await opened(A))?.items.map((i) => i.item_id)).toEqual(['item-a-1']);
  }, 15_000);

  it('second bank over an existing record: route fails, record unchanged until the retry', async () => {
    await exchange(A);
    const before = structuredClone(state.docs.get(docPath(A)));
    state.failWrites.add(docPath(A));
    plaidAnswer = { access_token: ACCESS_A2, item_id: 'item-a-2' };

    const { status, body } = await exchange(A);

    expect(status).toBe(503);
    expect(body.code).toBe('store_failed');
    expect(state.docs.get(docPath(A))).toEqual(before);
    state.failWrites.clear();
    await vi.waitFor(async () => expect((await opened(A))?.items).toHaveLength(2), {
      timeout: 6000,
    });
  }, 15_000);
});

describe('flag on: a legacy plaintext doc keeps no plaintext token', () => {
  it('the save deletes the plaintext fields and keeps the old Item, sealed', async () => {
    state.docs.set(docPath(A), { access_token: ACCESS_A2, item_id: 'item-legacy', linked_at: 'x' });
    expect(JSON.stringify(state.docs.get(docPath(A)))).toContain(ACCESS_A2);

    const { status } = await exchange(A);

    expect(status).toBe(200);
    const raw = state.docs.get(docPath(A)) as Record<string, unknown>;
    expect(raw.access_token).toBeUndefined();
    // As flag off (sealTokensForMerge): the token keys go; item_id and linked_at are not secrets.
    expect(JSON.stringify(raw)).not.toContain(ACCESS_A2);
    expect(JSON.stringify(raw)).not.toContain(ACCESS_A);
    expect((await opened(A))?.items.map((i) => [i.item_id, i.access_token])).toEqual([
      ['item-legacy', ACCESS_A2],
      ['item-a-1', ACCESS_A],
    ]);
  });
});
