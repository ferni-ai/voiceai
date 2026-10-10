/**
 * POST /api/seeds/import-local and the SEEDS_SERVER_LEDGER switch: real HTTP through the
 * real handler, on the Firestore emulator. A browser balance imports once, capped at 1000;
 * a dev "unlock all" balance (10 000+) imports nothing; only real items for sale are
 * granted; and the switch is what GET /api/seeds reports.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import admin from 'firebase-admin';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
});
afterEach(() => {
  delete process.env.SEEDS_SERVER_LEDGER;
});

describe.skipIf(!emulator)('seeds import-local (Firestore emulator)', () => {
  it('credits the browser balance, capped at 1000, once', async () => {
    const first = await importLocal(a, { balance: 1500.7, owned: [] });
    const again = await importLocal(a, { balance: 1500.7, owned: ['skin-cosmic'] });

    // A new account: 25 starter + 1000 imported
    expect(first).toEqual({
      status: 200,
      body: { imported: 1000, granted: [], alreadyImported: false, balance: 1025 },
    });
    expect(again.body).toEqual({
      imported: 0,
      granted: [],
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

    expect(dev.body).toEqual({ imported: 0, granted: [], alreadyImported: false, balance: 25 });
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
