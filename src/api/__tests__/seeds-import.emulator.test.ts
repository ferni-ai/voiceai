/**
 * POST /api/seeds/import-local and the SEEDS_SERVER_LEDGER switch: real HTTP through the
 * real handler, on the Firestore emulator. A browser balance imports once, capped at 1000;
 * a dev "unlock all" balance (10 000+) imports nothing; only real items for sale that the
 * caller's plan may buy are granted; only accounts created before SEEDS_IMPORT_BEFORE
 * import anything; and the switch is what GET /api/seeds reports. The plan and the
 * account's creation time are mocked at their modules' boundaries.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import admin from 'firebase-admin';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** The caller's plan by uid (default partner); 'throw' fails the lookup. */
const plans = new Map<string, string>();
vi.mock('../../services/billing/stripe-subscription.js', () => ({
  getSubscriptionInfo: vi.fn((uid: string) => {
    const tier = plans.get(uid) ?? 'partner';
    if (tier === 'throw') return Promise.reject(new Error('profile store down'));
    return Promise.resolve({ tier });
  }),
}));
/** Auth creation time by uid (default well before the cutoff); null = lookup failed. */
const created = new Map<string, string | null>();
vi.mock('../../services/identity/firebase-auth.js', () => ({
  getFirebaseUser: vi.fn((uid: string) => {
    const at = created.has(uid) ? created.get(uid) : 'Mon, 01 Jun 2026 12:00:00 GMT';
    return Promise.resolve(at === null ? null : { uid, metadata: { creationTime: at } });
  }),
}));
const CUTOFF = '2026-10-01T00:00:00Z';

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-seed-ledger';

let server: Server;
let base: string;
let db: admin.firestore.Firestore;
const id = () => `u-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  if (!emulator) return;
  const { handleSeedsRoutes } = await import('../seeds-routes.js');
  server = createServer((req, res) => {
    void handleSeedsRoutes(req, res, new URL(req.url ?? '/', 'http://x').pathname).then(
      (handled) => {
        if (!handled) res.writeHead(404).end();
      }
    );
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  db = admin.firestore();
});

afterAll(() => server?.close());

async function call(uid: string, method: string, path: string, body?: object) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'x-firebase-uid': uid, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const account = async (uid: string) => (await db.collection('user_seeds').doc(uid).get()).data();
const importLocal = (uid: string, body: object) =>
  call(uid, 'POST', '/api/seeds/import-local', body);

let a: string;
beforeEach(() => {
  a = id();
  process.env.SEEDS_SERVER_LEDGER = 'on';
  process.env.SEEDS_IMPORT_BEFORE = CUTOFF;
});
afterEach(() => {
  delete process.env.SEEDS_SERVER_LEDGER;
  delete process.env.SEEDS_IMPORT_BEFORE;
});

describe.skipIf(!emulator)('seeds import-local (Firestore emulator)', () => {
  it('credits the browser balance, capped at 1000, once', async () => {
    const first = await importLocal(a, { balance: 1500.7, owned: [] });
    const again = await importLocal(a, { balance: 1500.7, owned: ['skin-cosmic'] });

    // A new account: 25 starter + 1000 imported
    expect(first).toEqual({
      status: 200,
      body: { imported: 1000, granted: [], skipped: [], alreadyImported: false, balance: 1025 },
    });
    expect(again.body).toEqual({
      imported: 0,
      granted: [],
      skipped: [],
      alreadyImported: true,
      balance: 1025,
    });
    const data = await account(a);
    expect(data?.balance).toBe(1025);
    expect(data?.earnedFrom?.import).toBe(1000);
    expect(data?.ownedCosmetics ?? []).not.toContain('skin-cosmic');
  });

  it('credits a balance under the cap as-is, rounded down', async () => {
    await call(a, 'GET', '/api/seeds');
    expect((await importLocal(a, { balance: 312.9, owned: [] })).body).toMatchObject({
      imported: 312,
      balance: 337,
    });
  });

  it('a dev "unlock all" balance (10 000+) imports nothing, and still uses up the import', async () => {
    const dev = await importLocal(a, { balance: 10_000, owned: [] });
    const retry = await importLocal(a, { balance: 900, owned: [] });

    expect(dev.body).toEqual({
      imported: 0,
      granted: [],
      skipped: [],
      alreadyImported: false,
      balance: 25,
    });
    expect(retry.body).toMatchObject({ imported: 0, alreadyImported: true, balance: 25 });
    expect((await account(a))?.balance).toBe(25);
  });

  it('grants owned items that are for sale; default and unknown ids are ignored', async () => {
    const res = await importLocal(a, {
      balance: 40,
      owned: ['skin-default', 'theme-forest', 'made-up-item', 'sounds-rain', 'theme-forest', 7],
    });

    expect(res.body).toMatchObject({ imported: 40, granted: ['theme-forest', 'sounds-rain'] });
    expect((await account(a))?.ownedCosmetics).toEqual(['theme-forest', 'sounds-rain']);
    const summary = await call(a, 'GET', '/api/seeds');
    expect(summary.body.ownedCosmetics).toEqual([
      'skin-default',
      'theme-default',
      'voice-default',
      'theme-forest',
      'sounds-rain',
    ]);
  });

  it('a free account importing plan items gets them skipped, not granted', async () => {
    plans.set(a, 'free');
    const res = await importLocal(a, { balance: 100, owned: ['skin-aurora', 'theme-forest'] });

    expect(res.body).toMatchObject({
      imported: 100,
      granted: [],
      skipped: ['skin-aurora', 'theme-forest'],
    });
    expect((await account(a))?.ownedCosmetics).toBeUndefined();
  });

  it('a friend plan gets its items; a partner item (skin-aurora) is skipped', async () => {
    plans.set(a, 'friend');
    const res = await importLocal(a, { balance: 10, owned: ['skin-aurora', 'theme-forest'] });

    expect(res.body).toMatchObject({ granted: ['theme-forest'], skipped: ['skin-aurora'] });
    expect((await account(a))?.ownedCosmetics).toEqual(['theme-forest']);
  });

  it('a failed plan lookup grants no item, still credits the seeds, and records it', async () => {
    plans.set(a, 'throw');
    const res = await importLocal(a, { balance: 200, owned: ['theme-forest'] });

    expect(res.body).toMatchObject({ imported: 200, granted: [], skipped: ['theme-forest'] });
    const entry = await db.doc(`user_seeds/${a}/entries/import:local`).get();
    expect(entry.data()?.meta).toMatchObject({ planUnknown: true, skipped: ['theme-forest'] });
  });

  it('an account created after the cutoff imports 0, and the import is used up', async () => {
    created.set(a, 'Fri, 09 Oct 2026 08:00:00 GMT');
    const res = await importLocal(a, { balance: 1000, owned: ['theme-forest'] });
    const retry = await importLocal(a, { balance: 1000, owned: [] });

    expect(res.body).toEqual({
      imported: 0,
      granted: [],
      skipped: ['theme-forest'],
      alreadyImported: false,
      balance: 25,
      reason: 'account too new',
    });
    expect(retry.body).toMatchObject({ imported: 0, alreadyImported: true });
    expect((await account(a))?.balance).toBe(25);
  });

  it('no cutoff, or an unknown creation time: nothing happens and nothing is recorded', async () => {
    delete process.env.SEEDS_IMPORT_BEFORE;
    expect((await importLocal(a, { balance: 500, owned: [] })).status).toBe(503);
    process.env.SEEDS_IMPORT_BEFORE = CUTOFF;
    created.set(a, null);
    expect((await importLocal(a, { balance: 500, owned: [] })).status).toBe(503);
    expect(await account(a)).toBeUndefined();

    created.delete(a); // the lookup works again: the import was never used up
    expect((await importLocal(a, { balance: 500, owned: [] })).body).toMatchObject({
      imported: 500,
    });
  });

  it('a malformed request is refused without spending the import', async () => {
    expect((await importLocal(a, { balance: 'lots', owned: [] })).status).toBe(400);
    expect((await importLocal(a, { balance: 50 })).status).toBe(400);
    expect((await importLocal(a, { balance: 50, owned: [] })).body).toMatchObject({
      imported: 50,
      alreadyImported: false,
    });
  });

  it('is off, and changes nothing, unless SEEDS_SERVER_LEDGER is on', async () => {
    delete process.env.SEEDS_SERVER_LEDGER;
    const off = await importLocal(a, { balance: 500, owned: ['skin-cosmic'] });

    expect(off.status).toBe(404);
    expect(await account(a)).toBeUndefined();
  });

  it('GET /api/seeds reports the switch', async () => {
    expect((await call(a, 'GET', '/api/seeds')).body.serverLedger).toBe(true);
    process.env.SEEDS_SERVER_LEDGER = 'off';
    expect((await call(a, 'GET', '/api/seeds')).body.serverLedger).toBe(false);
    delete process.env.SEEDS_SERVER_LEDGER;
    expect((await call(a, 'GET', '/api/seeds')).body.serverLedger).toBe(false);
  });
});
