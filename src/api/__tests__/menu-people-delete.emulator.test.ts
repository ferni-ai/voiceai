/**
 * Remove in "People You've Told Me About" removes the person, from both contact stores.
 *
 * The edit form's Remove button sent DELETE /api/contacts/:id, which had no route, so it
 * always failed. Real route, real writers (the voice addContact tool, data capture's
 * upsertContact, the panel's POST), real Firestore (the emulator). The agent's read runs
 * in its own module graph (vi.resetModules), as the agent is its own process in production.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import admin from 'firebase-admin';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
if (emulator) {
  // Both contact services pick their project from these; the test's admin client must match
  process.env.GOOGLE_CLOUD_PROJECT = 'demo-menu-people';
  process.env.GCLOUD_PROJECT = 'demo-menu-people';
}

// The door verifies the caller and binds x-firebase-uid; that is not what this tests
vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: { headers: Record<string, string> }) => ({
    userId: req.headers['x-firebase-uid'],
    isAdmin: false,
  })),
  rateLimit: vi.fn(() => false),
}));

// The semantic index the agent recalls from; record what it is told to forget
const indexed = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../services/data-layer/hooks/contacts-hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  onContactChange: indexed,
  onContactInteractionChange: vi.fn(async () => undefined),
}));

let server: Server;
let base: string;
let db: admin.firestore.Firestore;
const newUser = (): string => `menu-people-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  if (!emulator) return;
  const { handleContactsRoutes } = await import('../contacts-routes.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void handleContactsRoutes(req, res, url.pathname, url).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
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

const stored = async (collection: string, uid: string): Promise<number> =>
  (await db.collection(collection).where('userId', '==', uid).get()).size;

/** The voice agent's addContact, in its own module graph; waits until the store has it */
async function agentAddContact(userId: string, args: Record<string, string>): Promise<string> {
  vi.resetModules();
  const { createContactsTools } = await import('../../tools/scheduling/contacts-tools.js');
  const tool = createContactsTools().addContact as unknown as {
    execute: (
      a: Record<string, string>,
      o: { ctx: unknown; toolCallId: string }
    ) => Promise<string>;
  };
  await tool.execute(args, { ctx: { userData: { userId } }, toolCallId: 'menu-people' });
  for (let i = 0; i < 50; i++) {
    const saved = await db.collection('user_contacts').where('userId', '==', userId).get();
    const doc = saved.docs.find((d) => d.data().displayName === args.name);
    if (doc) return doc.id;
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }
  throw new Error(`addContact never saved ${args.name}`);
}

/** What the agent reads on its next call, from a fresh process */
async function agentReads(uid: string): Promise<{ kept: string[]; saved: string[] }> {
  vi.resetModules();
  const relationships = await import('../../services/contacts/contact-relationship-service.js');
  const contacts = await import('../../services/identity/contacts/contacts-management.js');
  return {
    kept: (await relationships.getContacts(uid)).map((c) => c.name),
    saved: (await contacts.getUserContacts(uid)).map((c) => c.displayName),
  };
}

describe.skipIf(!emulator)('Remove takes a person out of both stores (Firestore emulator)', () => {
  it('Remove on someone added in the panel deletes them, and the panel list no longer has them', async () => {
    const uid = newUser();
    await call(uid, 'POST', '/api/contacts', { name: 'Lena Park', relationship: 'friend' });
    await call(uid, 'POST', '/api/contacts', { name: 'Kai Moana', relationship: 'friend' });
    const listed = (await call(uid, 'GET', '/api/contacts')).body.contacts as Array<{
      name: string;
      contactId: string;
    }>;
    const lena = listed.find((p) => p.name === 'Lena Park');

    const removed = await call(uid, 'DELETE', `/api/contacts/${lena?.contactId}`);

    expect(removed.status).toBe(200);
    const after = (await call(uid, 'GET', '/api/contacts')).body.contacts as Array<{
      name: string;
    }>;
    expect(after.map((p) => p.name)).toEqual(['Kai Moana']);
    expect(await agentReads(uid)).toEqual({ kept: ['Kai Moana'], saved: [] });
  });

  it('someone told about in a call and synced by data capture is gone from both stores, with their moments', async () => {
    const uid = newUser();
    const savedId = await agentAddContact(uid, {
      name: 'Rosa Diaz',
      phone: '555-201-3344',
      relationship: 'mother',
    });
    // Data capture's sync links the two copies by contactId (intelligence/data-capture)
    vi.resetModules();
    const capture = await import('../../services/contacts/contact-relationship-service.js');
    await capture.upsertContact(uid, {
      name: 'Rosa Diaz',
      contactId: savedId,
      relationship: 'family',
    });
    const keptId = (await capture.getContacts(uid))[0].id;
    await call(uid, 'POST', `/api/contacts/${savedId}/interaction`, {
      type: 'phone_call',
      summary: 'Talked about her garden',
    });
    expect([
      await stored('user_contacts', uid),
      await stored('contact_relationships', uid),
    ]).toEqual([1, 1]);
    expect(await stored('contact_interactions', uid)).toBe(1);

    const removed = await call(uid, 'DELETE', `/api/contacts/${savedId}`);

    expect(removed).toMatchObject({
      status: 200,
      body: { relationships: 1, saved: 1, interactions: 1 },
    });
    expect(await stored('user_contacts', uid)).toBe(0);
    expect(await stored('contact_relationships', uid)).toBe(0);
    expect(await stored('contact_interactions', uid)).toBe(0);
    expect(await agentReads(uid)).toEqual({ kept: [], saved: [] });
    // Both copies leave the semantic index too, so recall can't bring her back
    const forgotten = indexed.mock.calls
      .filter((c: unknown[]) => c[0] === uid && c[3] === 'delete')
      .map((c: unknown[]) => c[1]);
    expect(forgotten).toEqual(expect.arrayContaining([savedId, keptId]));
  });

  it('someone added in the panel and also saved in a call is removed from both by the panel id', async () => {
    const uid = newUser();
    const created = await call(uid, 'POST', '/api/contacts', {
      name: 'Priya Raman',
      relationship: 'friend',
    });
    const panelId = (created.body.contact as { contactId: string }).contactId;
    await agentAddContact(uid, { name: 'Priya Raman', phone: '555-010-9988' });

    expect((await call(uid, 'DELETE', `/api/contacts/${panelId}`)).body).toMatchObject({
      relationships: 1,
      saved: 1,
    });
    expect(await agentReads(uid)).toEqual({ kept: [], saved: [] });
  });

  it('someone only the voice agent saved can be removed by their saved id', async () => {
    const uid = newUser();
    const savedId = await agentAddContact(uid, { name: 'Sam Lee', email: 'sam@example.com' });

    expect((await call(uid, 'DELETE', `/api/contacts/${savedId}`)).status).toBe(200);
    expect(await agentReads(uid)).toEqual({ kept: [], saved: [] });
  });

  it("someone else's person is not found, and stays theirs", async () => {
    const owner = newUser();
    const savedId = await agentAddContact(owner, { name: 'Not Yours', phone: '555-000-1111' });

    expect((await call(newUser(), 'DELETE', `/api/contacts/${savedId}`)).status).toBe(404);
    expect(await stored('user_contacts', owner)).toBe(1);
  });
});
