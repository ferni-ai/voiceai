/**
 * v1 POST /banking/exchange-token with PLAID_UNIFIED_STORE: the Item lands in the
 * sealed per-user store with its Item id, a refused save answers 503 (not
 * success), and the flag-off path still hands the file store what main did.
 *
 * Real HTTP through the REAL handler, auth middleware, facade and persistence
 * layer over the Firestore fake. Only Firebase token checks, Plaid's exchange
 * call, the background analysis and the old file store are stand-ins.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
} from '../../../../tests/helpers/merge-fake-firestore.js';

const h = vi.hoisted(() => ({
  db: null as unknown,
  exchange: vi.fn(
    async () =>
      ({ access_token: 'access-sandbox-fixture-v1', item_id: 'item-v1' }) as {
        access_token: string;
        item_id: string;
      } | null
  ),
  fileStore: vi.fn(),
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
vi.mock('../../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-A' ? { uid: 'uid-A-fictional', claims: {}, isAnonymous: false } : null
  ),
}));
vi.mock('../../../../tools/domains/finance/plaid.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  exchangePublicToken: h.exchange,
}));
vi.mock('../../../../services/finance/prediction.js', () => ({
  detectBills: vi.fn(async () => []),
  detectIncome: vi.fn(async () => []),
  detectAnomalies: vi.fn(async () => []),
}));
vi.mock('../../../../tools/domains/finance/plaid-store.js', () => ({
  storeAccessToken: h.fileStore,
  getTokenData: vi.fn(() => null),
  getStoredAccessToken: vi.fn(() => null),
  hasLinkedAccounts: vi.fn(() => false),
  removeAccessToken: vi.fn(() => false),
}));

const state = newMergeFakeState();
h.db = createMergeFakeFirestore(state);
const DOC = 'bogle_users/uid-A-fictional/plaid_tokens/data';
const KEY_VARS = ['TOKEN_SEALING_KEY', 'OAUTH_ENCRYPTION_KEY', 'LOG_HASH_SECRET'] as const;

const { handleIntegrationsRoutes } = await import('../handler.js');
const { decryptData } = await import('../../../../utils/token-encryption.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleIntegrationsRoutes(req, res, url.pathname, url);
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
  state.docs.clear();
  state.writes.length = 0;
  for (const k of KEY_VARS) delete process.env[k];
  process.env.OAUTH_ENCRYPTION_KEY = 'fixture-encryption-key';
  process.env.PLAID_UNIFIED_STORE = 'on';
});

const exchange = () =>
  fetch(`${base}/api/v1/integrations/banking/exchange-token`, {
    method: 'POST',
    headers: { authorization: 'Bearer tok-A', 'content-type': 'application/json' },
    body: JSON.stringify({
      publicToken: 'public-sandbox-fixture',
      institution: { name: 'Fictional CU' },
    }),
  });

describe('v1 exchange-token', () => {
  it('flag on: stores the sealed Item with its id, and status reads it', async () => {
    expect(state.docs.has(DOC)).toBe(false);

    const res = await exchange();

    expect(res.status).toBe(200);
    const raw = state.docs.get(DOC) as { encrypted: string };
    expect(JSON.stringify(raw)).not.toContain('access-sandbox-fixture-v1');
    expect(decryptData<{ items: unknown[] }>(raw.encrypted)?.items).toEqual([
      expect.objectContaining({ access_token: 'access-sandbox-fixture-v1', item_id: 'item-v1' }),
    ]);
    expect(h.fileStore).not.toHaveBeenCalled();
    const status = await fetch(`${base}/api/v1/integrations/banking/status`, {
      headers: { authorization: 'Bearer tok-A' },
    });
    expect(await status.json()).toMatchObject({ connected: true, institution: 'Fictional CU' });
  });

  it('flag on, no token key: 503 with the typed refusal, nothing written', async () => {
    for (const k of KEY_VARS) delete process.env[k];

    const res = await exchange();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: 'Bank account not saved',
      code: 'sealing_unavailable',
    });
    expect(state.writes).toEqual([]);
  });

  it('a failed Plaid exchange is still 400 and stores nothing', async () => {
    h.exchange.mockResolvedValueOnce(null);

    const res = await exchange();

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Failed to exchange token' });
    expect(state.writes).toEqual([]);
  });

  it('flag off: the file store gets what main gave it (no Item id)', async () => {
    process.env.PLAID_UNIFIED_STORE = 'off';

    const res = await exchange();

    expect(res.status).toBe(200);
    expect(h.fileStore).toHaveBeenCalledWith(
      'uid-A-fictional',
      'access-sandbox-fixture-v1',
      undefined,
      { name: 'Fictional CU' }
    );
    expect(state.writes).toEqual([]);
  });
});
