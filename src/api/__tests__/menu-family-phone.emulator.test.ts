/**
 * Family Phone Access, end to end on the Firestore emulator: the panel's own POST, GET,
 * PUT and DELETE through the real /api/sponsored-identities handler and the real store.
 * One sponsor's family is theirs alone: another signed-in user can't list, read, change
 * or remove it.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// src/tests/setup.ts fakes firebase-admin for every test; this file reads the emulator
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-family-phone';

// The door verifies the caller and binds x-firebase-uid; that is not what this tests
vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: { headers: Record<string, string> }) => ({
    userId: req.headers['x-firebase-uid'],
    isAdmin: false,
  })),
  rateLimit: vi.fn(() => false),
}));

let server: Server;
let base: string;
let db: Firestore;
const newUser = (): string => `menu-family-${Math.random().toString(36).slice(2)}`;
/** A US 555 number no other test has used */
const freshPhone = (): string =>
  `+1 555 ${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;

beforeAll(async () => {
  if (!emulator) return;
  const { handleSponsoredIdentityRoutes } = await import('../sponsored-identity-routes.js');
  const { getAdminFirestore } = await import('../../utils/firebase-admin-app.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void handleSponsoredIdentityRoutes(req, res, url.pathname).then((handled) => {
      if (!handled) res.writeHead(404).end('{}');
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  db = getAdminFirestore();
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

type Listed = { id: string; displayName: string; relationship: string; notes?: string };
const list = async (uid: string): Promise<Listed[]> =>
  (await call(uid, 'GET', '/api/sponsored-identities')).body.identities as Listed[];
const stored = async (id: string) =>
  (await db.collection('sponsored_identities').doc(id).get()).data();

/** What the panel's "Add to family" sends (family-identities.ui.ts createIdentity) */
async function add(uid: string, displayName: string, phone = freshPhone()) {
  const res = await call(uid, 'POST', '/api/sponsored-identities', {
    displayName,
    phoneNumber: phone,
    relationship: 'grandmother',
    preferredName: 'Gran',
    notes: 'Loves crosswords',
  });
  expect(res.status).toBe(201);
  return (res.body.identity as Listed).id;
}

describe.skipIf(!emulator)('Family Phone Access round trip (Firestore emulator)', () => {
  it('an added family member is stored and listed back', async () => {
    const sponsor = newUser();
    const id = await add(sponsor, 'Ruth Okafor');

    expect(await list(sponsor)).toEqual([
      expect.objectContaining({ id, displayName: 'Ruth Okafor', relationship: 'grandmother' }),
    ]);
    expect(await stored(id)).toMatchObject({ sponsorUserId: sponsor, notes: 'Loves crosswords' });
  });

  it('an edit is saved to the store and listed back', async () => {
    const sponsor = newUser();
    const id = await add(sponsor, 'Ruth Okafor');

    // What the panel's "Save changes" sends (updateIdentity)
    const res = await call(sponsor, 'PUT', `/api/sponsored-identities/${id}`, {
      displayName: 'Grandma Ruth',
      relationship: 'grandparent',
      notes: 'Calls on Sundays',
    });

    expect(res.status).toBe(200);
    expect(await stored(id)).toMatchObject({
      displayName: 'Grandma Ruth',
      notes: 'Calls on Sundays',
    });
    expect(await list(sponsor)).toEqual([
      expect.objectContaining({ id, displayName: 'Grandma Ruth', relationship: 'grandparent' }),
    ]);
  });

  it('a removed family member is gone, number and all, and the number can be added again', async () => {
    const sponsor = newUser();
    const phone = freshPhone();
    const id = await add(sponsor, 'Ruth Okafor', phone);
    const normalized = (await stored(id))?.phoneNumber as string;
    const index = db.collection('sponsored_identity_phone_index').doc(normalized);
    expect((await index.get()).exists).toBe(true);

    expect((await call(sponsor, 'DELETE', `/api/sponsored-identities/${id}`)).status).toBe(200);

    expect(await list(sponsor)).toEqual([]);
    expect(await stored(id)).toBeUndefined();
    expect((await index.get()).exists, 'the number is not left in the phone index').toBe(false);
    await add(sponsor, 'Ruth again', phone);
  });

  it("another user can't list, read, change or remove someone else's family", async () => {
    const sponsor = newUser();
    const stranger = newUser();
    const id = await add(sponsor, 'Ruth Okafor');

    expect(await list(stranger)).toEqual([]);
    expect((await call(stranger, 'GET', `/api/sponsored-identities/${id}`)).status).toBe(403);

    const put = await call(stranger, 'PUT', `/api/sponsored-identities/${id}`, {
      displayName: 'Hijacked',
    });
    const del = await call(stranger, 'DELETE', `/api/sponsored-identities/${id}`);

    expect(put.status).toBeGreaterThanOrEqual(400);
    expect(del.status).toBeGreaterThanOrEqual(400);
    expect(await stored(id)).toMatchObject({ sponsorUserId: sponsor, displayName: 'Ruth Okafor' });
    expect(await list(sponsor)).toEqual([
      expect.objectContaining({ id, displayName: 'Ruth Okafor' }),
    ]);
  });
});
