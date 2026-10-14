/**
 * "People You've Told Me About" shows the people Ferni was told about in a call.
 *
 * The voice agent's addContact tool saves to `user_contacts`; GET /api/contacts read only
 * `contact_relationships`, so nobody added in a call reached the panel. Both caches over
 * those stores also never expired, so a process that had read a user once never saw what
 * the other process (agent or web server) wrote afterwards.
 *
 * Real writer, real route, real Firestore (the emulator). The voice agent is its own
 * module graph here (vi.resetModules), as it is its own process in production, so
 * nothing it caches in memory can leak into the web server's answer.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import admin from 'firebase-admin';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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

let server: Server;
let base: string;
let db: admin.firestore.Firestore;
const newUser = () => `menu-people-${Math.random().toString(36).slice(2)}`;

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
afterEach(() => {
  vi.useRealTimers();
});

interface Person {
  id: string;
  contactId: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  relationship?: string;
}

async function call(uid: string, method: string, path: string, body?: object) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'x-firebase-uid': uid, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const people = async (uid: string) =>
  (await call(uid, 'GET', '/api/contacts')).body.contacts as Person[];

/** The voice agent's addContact, loaded fresh: its own module graph, its own caches */
async function agentAddContact(userId: string, args: Record<string, string>): Promise<void> {
  vi.resetModules();
  const { createContactsTools } = await import('../../tools/scheduling/contacts-tools.js');
  const tool = createContactsTools().addContact as unknown as {
    execute: (
      a: Record<string, string>,
      o: { ctx: unknown; toolCallId: string }
    ) => Promise<string>;
  };
  await tool.execute(args, { ctx: { userData: { userId } }, toolCallId: 'menu-people' });
  // The tool saves in the background; wait until the store has it
  for (let i = 0; i < 50; i++) {
    const saved = await db.collection('user_contacts').where('userId', '==', userId).get();
    if (saved.docs.some((d) => d.data().displayName === args.name)) return;
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }
  throw new Error(`addContact never saved ${args.name}`);
}

/** The user's saved contact once the store has it in the shape `ready` expects */
async function savedContact(
  userId: string,
  ready: (c: admin.firestore.DocumentData) => boolean
): Promise<admin.firestore.DocumentData> {
  for (let i = 0; i < 50; i++) {
    const saved = await db.collection('user_contacts').where('userId', '==', userId).get();
    const match = saved.docs.map((d) => d.data()).find(ready);
    if (match) return match;
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }
  throw new Error('the edit never reached user_contacts');
}

describe.skipIf(!emulator)(
  'People panel reads who Ferni was told about (Firestore emulator)',
  () => {
    it('a person the voice agent saved in a call is listed, in a group the panel shows', async () => {
      const uid = newUser();
      await agentAddContact(uid, {
        name: 'Rosa Diaz',
        phone: '555-201-3344',
        relationship: 'mother',
      });

      const listed = (await people(uid)).find((p) => p.name === 'Rosa Diaz');

      expect(listed).toMatchObject({ phone: '+15552013344', relationship: 'family' });
    });

    it('the person card opens for them: GET /api/contacts/:contactId finds that person', async () => {
      const uid = newUser();
      await agentAddContact(uid, {
        name: 'Dr. Okafor',
        phone: '555-777-1000',
        relationship: 'doctor',
      });
      const { contactId } = (await people(uid))[0];

      const card = await call(uid, 'GET', `/api/contacts/${contactId}`);

      expect(card.status).toBe(200);
      expect(card.body.contact).toMatchObject({ name: 'Dr. Okafor', relationship: 'professional' });
    });

    it('someone in both stores is listed once, keeping what was typed in the panel', async () => {
      const uid = newUser();
      await call(uid, 'POST', '/api/contacts', {
        name: 'Priya Raman',
        relationship: 'friend',
        notes: 'Met at the climbing gym',
      });
      await agentAddContact(uid, {
        name: 'Priya Raman',
        phone: '555-010-9988',
        notes: 'from a call',
      });

      const priyas = (await people(uid)).filter((p) => p.name === 'Priya Raman');

      expect(priyas).toHaveLength(1);
      expect(priyas[0]).toMatchObject({
        relationship: 'friend',
        notes: 'Met at the climbing gym',
        phone: '+15550109988',
      });
    });

    it('a call that saves someone after the panel was opened shows on the next open', async () => {
      const uid = newUser();
      expect(await people(uid)).toEqual([]); // the web server has now read this user once

      await agentAddContact(uid, {
        name: 'Sam Lee',
        email: 'sam@example.com',
        relationship: 'friend',
      });
      vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
      vi.setSystemTime(Date.now() + 61_000); // past the read's TTL

      expect((await people(uid)).map((p) => p.name)).toEqual(['Sam Lee']);
    });

    it('a person data capture syncs to contact_relationships in a call shows on the next open too', async () => {
      const uid = newUser();
      expect(await people(uid)).toEqual([]);

      // Data capture's sync (intelligence/data-capture) calls upsertContact in the agent's process
      vi.resetModules();
      const agent = await import('../../services/contacts/contact-relationship-service.js');
      await agent.upsertContact(uid, {
        name: 'Grandpa Joe',
        contactId: 'gj',
        relationship: 'family',
      });
      vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
      vi.setSystemTime(Date.now() + 61_000);

      expect((await people(uid)).map((p) => p.name)).toEqual(['Grandpa Joe']);
    });

    it('someone added in the panel reaches the agent on its next call, though it read this user before', async () => {
      const uid = newUser();
      vi.resetModules();
      // The agent's read for its context (contact-awareness, relationship-health)
      const agent = await import('../../services/contacts/contact-relationship-service.js');
      expect(await agent.getContacts(uid)).toEqual([]);

      await call(uid, 'POST', '/api/contacts', { name: 'Aunt May', relationship: 'family' });
      vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
      vi.setSystemTime(Date.now() + 61_000);

      expect((await agent.getContacts(uid)).map((p) => p.name)).toEqual(['Aunt May']);
    });

    it('an edit to someone saved in a call is saved where the agent reads it', async () => {
      const uid = newUser();
      await agentAddContact(uid, {
        name: 'Rosa Diaz',
        phone: '555-201-3344',
        relationship: 'mother',
        notes: 'Calls on Sundays',
      });
      const [rosa] = await people(uid);

      // The edit form sends every field, emptied ones too
      const edited = await call(uid, 'PUT', `/api/contacts/${rosa.contactId}`, {
        name: 'Rosa Diaz',
        relationship: 'family',
        phone: '555-201-9999',
        email: '',
        notes: '',
        howWeMet: 'She is my mom',
      });
      expect(edited.status).toBe(200);

      const stored = await savedContact(uid, (c) => c.phones?.[0]?.number === '+15552019999');
      // A fresh agent graph: what the agent's findMyContact and calling tools read
      vi.resetModules();
      const agent = await import('../../services/identity/contacts/contacts-management.js');
      const [heard] = await agent.getUserContacts(uid);

      expect(heard).toMatchObject({
        phones: [{ number: '+15552019999' }],
        howWeMet: 'She is my mom',
      });
      expect(heard.relationship).toBe('mother'); // the group didn't change, so the word Ferni heard stays
      expect(stored.notes).toBeNull(); // emptied in the panel, cleared in the store
      expect((await people(uid))[0]).toMatchObject({
        relationship: 'family',
        phone: '+15552019999',
        howWeMet: 'She is my mom',
      });
    });

    it('an edit to nobody this person has is still not found', async () => {
      const other = newUser();
      await agentAddContact(other, { name: 'Not Yours', phone: '555-000-1111' });
      const [theirs] = await people(other);

      const edit = await call(newUser(), 'PUT', `/api/contacts/${theirs.contactId}`, {
        name: 'Mine now',
      });

      expect(edit.status).toBe(404);
    });
  }
);
