/**
 * Menu item 31, Take Your Story: the export carries every store a panel reads or the voice
 * agent writes. One document goes into each store in KNOWN_USER_STORES (the list kept next
 * to the export code), then GET /api/export/categories and POST /api/export run through
 * the real route handler, as the web's data-export.service.ts calls them, on the Firestore
 * emulator. A known store missing from the file fails this test.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { KNOWN_USER_STORES } from '../../services/platform/user-records-export.js';

// The shared setup fakes Firestore for every test; here the export must read the emulator
vi.mock('firebase-admin/app', async () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', async () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  ensureFirebaseAdmin: () => true,
  getFirebaseUserOrThrow: async () => null, // no Firebase user: no proven phone profiles
}));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-export';

let server: Server;
let base: string;
let db: Firestore;
const id = () => `u-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  if (!emulator) return;
  const { getAdminFirestore } = await import('../../utils/firebase-admin-app.js');
  db = getAdminFirestore();
  const { handleDataRoutes } = await import('../routes/data.js');
  const { rememberVerifiedUid } = await import('../rate-limit-identity.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    // As the API server's door does once it has verified the caller (request-identity.ts)
    const uid = req.headers['x-firebase-uid'];
    rememberVerifiedUid(req, typeof uid === 'string' ? uid : null);
    void handleDataRoutes(req, res, url.pathname, url).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

/** One document in a store: "a/{uid}/b" is a subcollection, "a/{uid}" a doc, "a" a uid field */
async function seed(store: string, uid: string, marker: string): Promise<void> {
  const path = store.replace('{uid}', uid);
  const parts = path.split('/');
  if (parts.length % 2 === 0) {
    await db.doc(path).set({ marker }, { merge: true });
  } else if (parts.length === 1) {
    const field = store === 'sponsored_identities' ? 'sponsorUserId' : 'userId';
    await db
      .collection(path)
      .add({ [field]: uid, name: marker, marker, lastInteraction: new Date() });
  } else {
    await db.collection(path).add({ marker, at: new Date() });
  }
}

async function exportAll(uid: string) {
  const headers = { 'x-firebase-uid': uid, 'content-type': 'application/json' };
  const listed = await fetch(`${base}/api/export/categories`, { headers });
  const { categories } = (await listed.json()) as {
    categories: Array<{ category: string; itemCount: number }>;
  };
  const res = await fetch(`${base}/api/export`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ format: 'json', categories: categories.map((c) => c.category) }),
  });
  expect(res.status).toBe(200);
  const file = (await res.json()) as { categories: Record<string, Record<string, unknown>> };
  return { categories, records: file.categories.records ?? {} };
}

describe.skipIf(!emulator)('export carries every known user store (Firestore emulator)', () => {
  it('each store in KNOWN_USER_STORES is in the file, with its document', async () => {
    const uid = id();
    for (const store of KNOWN_USER_STORES) await seed(store, uid, `marker:${store}`);

    const { categories, records } = await exportAll(uid);

    const missing = KNOWN_USER_STORES.filter(
      (store) => !JSON.stringify(records[store] ?? null).includes(`marker:${store}`)
    );
    expect(missing).toEqual([]);
    expect(categories.find((c) => c.category === 'Records')?.itemCount).toBe(
      KNOWN_USER_STORES.length
    );
  });

  it('timestamps come out as ISO strings', async () => {
    const uid = id();
    await seed('users/{uid}/calendar_events', uid, 'when');
    const { records } = await exportAll(uid);
    const [event] = records['users/{uid}/calendar_events'] as Array<{ at: string }>;
    expect(event?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("exports no credential, nested secret or unreviewed store, and keeps the owner's content", async () => {
    const uid = id();
    // A token store, a web-push subscription, and stores nobody has reviewed for export
    await db.doc(`bogle_users/${uid}/google_calendar_tokens/data`).set({ refresh: 'r-secret' });
    await db.collection(`bogle_users/${uid}/push_subscriptions`).add({
      endpoint: 'https://push.example/e-secret',
      keys: { p256dh: 'k-secret', auth: 'a-secret' },
    });
    await db.collection(`bogle_users/${uid}/webauthn_passkeys`).add({ publicKey: 'w-secret' });
    await db.collection(`users/${uid}/plaid_items`).add({ itemId: 'pl-secret' });
    // Secrets nested in objects and arrays inside the owner's own content
    await db.doc(`bogle_users/${uid}`).set({ name: 'Dana', pushToken: 'p-secret' });
    await db.collection(`users/${uid}/calendar_events`).add({
      title: 'Lunch with Sam',
      zipCode: '33701',
      attendees: [{ name: 'Sam', accessToken: 'n-secret' }],
      meta: { keys: { auth: 'm-secret' }, passwordHash: 'h-secret', otp: '123987' },
      // the same secrets spelled to dodge a byte-wise match, and kept as a JSON string
      'ID-TOKEN': 'idt-secret',
      APIKey: 'apik-secret',
      pushSubscription: JSON.stringify({ endpoint: 'https://x/ps-secret', note: 'device' }),
      shared: [{ who: 'Ana', 'access.token': 'dot-secret' }],
      note: 'Bearer bearer-secret',
      settings: JSON.stringify({ refreshToken: 'json-secret', theme: 'dark' }),
    });
    // A sponsored identity: what the sponsor entered, not the family member's own record
    await db.collection('sponsored_identities').add({
      sponsorUserId: uid,
      displayName: 'Barbara',
      phoneNumber: '+15550101',
      relationship: 'parent',
      familyUserId: 'family_s-secret',
      voiceProfileId: 'v-secret',
      totalCalls: 41,
      selfRegisteredName: 'Babs-secret',
    });

    const { records } = await exportAll(uid);
    const file = JSON.stringify(records);

    expect(file).not.toMatch(/-secret|123987/);
    expect(Object.keys(records)).not.toContain('bogle_users/{uid}/push_subscriptions');
    for (const kept of [
      'Dana',
      '\\"theme\\":\\"dark\\"',
      'Lunch with Sam',
      '"name":"Sam"',
      '33701',
      'Barbara',
      '+15550101',
    ]) {
      expect(file).toContain(kept);
    }
    const [identity] = records.sponsored_identities as Array<Record<string, unknown>>;
    expect(identity).not.toHaveProperty('totalCalls');
  });

  it("carries the router's turn events from every day, and not another person's", async () => {
    const uid = id();
    const other = id();
    const day = (d: string, doc: string) => db.doc(`semantic_router_events/${d}/events/${doc}`);
    await day('2026-03-01', `a-${uid}`).set({ userId: uid, toolId: 'weather' });
    await day('2026-10-24', `b-${uid}`).set({ userId: uid, toolId: 'timer' });
    await day('2026-10-24', `c-${other}`).set({ userId: other, toolId: 'not-yours' });

    const { categories, records } = await exportAll(uid);

    const rows = records['semantic_router_events/*/events'] as Array<{ toolId: string }>;
    expect(rows.map((r) => r.toolId).sort()).toEqual(['timer', 'weather']);
    expect(JSON.stringify(records)).not.toContain('not-yours');
    expect(categories.find((c) => c.category === 'Records')?.itemCount).toBe(2);
  });

  it("someone else's records are not in the file", async () => {
    const owner = id();
    for (const store of KNOWN_USER_STORES) await seed(store, owner, 'not-yours');
    const { records } = await exportAll(id());
    expect(JSON.stringify(records)).not.toContain('not-yours');
  });
});
