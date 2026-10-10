/**
 * POST /api/seeds/purchase: real HTTP through the real handler, on the Firestore emulator.
 * A purchase charges the server's price once and records ownership in the same write;
 * a repeat, a retry or two racing requests never charge twice, and a failed purchase
 * writes nothing.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import admin from 'firebase-admin';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-seed-ledger';

let server: Server;
let base: string;
let db: admin.firestore.Firestore;
const id = () => `u-${Math.random().toString(36).slice(2)}`;
const DEFAULTS = ['skin-default', 'theme-default', 'voice-default'];

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
const buy = (uid: string, itemId: unknown) => call(uid, 'POST', '/api/seeds/purchase', { itemId });
const account = async (uid: string) =>
  (await db.collection('user_seeds').doc(uid).get()).data() ?? {};
const purchaseEntries = async (uid: string) =>
  (
    await db
      .collection('user_seeds')
      .doc(uid)
      .collection('entries')
      .where('reason', '==', 'purchase')
      .get()
  ).docs.map((d) => ({ id: d.id, ...d.data() }));

let a: string;
beforeEach(() => {
  a = id();
});

describe.skipIf(!emulator)('POST /api/seeds/purchase (Firestore emulator)', () => {
  it('buying charges the server price once and the item is owned', async () => {
    await db.collection('user_seeds').doc(a).set({ balance: 400 });

    const first = await buy(a, 'theme-forest');
    expect(first).toEqual({
      status: 200,
      body: { owned: true, charged: true, itemId: 'theme-forest', balance: 200 },
    });
    expect(await account(a)).toMatchObject({ balance: 200, ownedCosmetics: ['theme-forest'] });

    const again = await buy(a, 'theme-forest');
    expect(again.body).toMatchObject({ owned: true, charged: false, balance: 200 });
    expect((await account(a)).balance).toBe(200);
    expect(await purchaseEntries(a)).toMatchObject([
      {
        id: 'purchase:theme-forest',
        delta: -200,
        balanceAfter: 200,
        meta: { itemId: 'theme-forest' },
      },
    ]);
  });

  it('a retry whose ownership was lost re-grants the item without charging again', async () => {
    await db.collection('user_seeds').doc(a).set({ balance: 400 });
    await buy(a, 'voice-calm'); // 400 -> 100
    await db
      .collection('user_seeds')
      .doc(a)
      .update({ ownedCosmetics: admin.firestore.FieldValue.delete() });

    expect((await buy(a, 'voice-calm')).body).toMatchObject({ charged: false, balance: 100 });
    expect(await account(a)).toMatchObject({ balance: 100, ownedCosmetics: ['voice-calm'] });
  });

  it('an unknown or missing item id is a 400 and writes nothing', async () => {
    expect(await buy(a, 'skin-free-money')).toEqual({
      status: 400,
      body: { error: 'Unknown item' },
    });
    expect((await call(a, 'POST', '/api/seeds/purchase', {})).status).toBe(400);
    expect((await buy(a, { id: 'skin-cosmic' })).status).toBe(400);
    expect((await db.collection('user_seeds').doc(a).get()).exists).toBe(false);
  });

  it("can't afford it: 400, and balance and ownership are unchanged", async () => {
    await call(a, 'GET', '/api/seeds'); // a new account: 25 seeds

    expect(await buy(a, 'skin-cosmic')).toEqual({
      status: 400,
      body: { error: 'Insufficient seeds' },
    });
    const after = await account(a);
    expect(after.balance).toBe(25);
    expect(after.ownedCosmetics).toBeUndefined();
    expect(await purchaseEntries(a)).toEqual([]);
  });

  it("can't afford it with no account yet: nothing is created", async () => {
    expect((await buy(a, 'sounds-rain')).status).toBe(400);
    expect((await db.collection('user_seeds').doc(a).get()).exists).toBe(false);
  });

  it('a default item is already owned: no charge, no write', async () => {
    expect(await buy(a, 'skin-default')).toEqual({
      status: 200,
      body: { owned: true, charged: false, itemId: 'skin-default' },
    });
    expect((await db.collection('user_seeds').doc(a).get()).exists).toBe(false);
  });

  it('two concurrent purchases of the same item charge once', async () => {
    await db.collection('user_seeds').doc(a).set({ balance: 1000 });

    const results = await Promise.all([
      buy(a, 'skin-cosmic'),
      buy(a, 'skin-cosmic'),
      buy(a, 'skin-cosmic'),
    ]);

    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(results.filter((r) => r.body.charged === true)).toHaveLength(1);
    expect(await account(a)).toMatchObject({ balance: 500, ownedCosmetics: ['skin-cosmic'] });
    expect(await purchaseEntries(a)).toHaveLength(1);
  });

  it('GET /api/seeds shows the defaults plus what was bought', async () => {
    expect((await call(a, 'GET', '/api/seeds')).body.ownedCosmetics).toEqual(DEFAULTS);
    await db.collection('user_seeds').doc(a).set({ balance: 1000 }, { merge: true });
    await buy(a, 'sounds-rain');
    await buy(a, 'theme-cozy');

    const { body } = await call(a, 'GET', '/api/seeds');
    expect(body.ownedCosmetics).toEqual([...DEFAULTS, 'sounds-rain', 'theme-cozy']);
    expect(body.balance).toBe(350);
  });
});
