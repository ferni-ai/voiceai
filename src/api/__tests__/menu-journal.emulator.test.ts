/**
 * The Chronicle (journal), call → panel → correction, on the Firestore emulator.
 *
 * Writes with the production writer the voice `journal` tool and saveNote/addGratitude
 * use (saveCallJournalEntry, tools/domains/productivity/call-journal.ts), then reads with
 * the exact request the panel sends (chronicle-entries.ui.ts chroniclePath:
 * GET /api/journal/chronicle?userId=<uid>). Before (menu audit 2026-10-24) the call test
 * stopped at the service, the panel listed only the newest entry, and nothing could be
 * edited or deleted from the Chronicle; the server also sent an "N-Day Streak" card.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// src/tests/setup.ts fakes firebase-admin and getFirestoreDb for every test; the writer and
// the route read through them, so this file swaps the real ones back in.
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../utils/firestore-utils.js', async () => {
  const actual = await vi.importActual<typeof import('../../utils/firestore-utils.js')>(
    '../../utils/firestore-utils.js'
  );
  return { ...actual, getFirestoreDb: vi.fn(actual.getFirestoreDb) };
});
// A request carrying x-test-uid is signed in as that user (a verified token's uid). Any
// other request goes through the real requireAuth, so no token is refused as in production.
vi.mock('../auth-middleware.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth-middleware.js')>();
  return {
    ...actual,
    requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
      const uid = req.headers['x-test-uid'];
      if (typeof uid !== 'string') return actual.requireAuth(req, res);
      return { userId: uid, isAdmin: false, isDevMode: false, authMethod: 'firebase' as const };
    }),
  };
});

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-journal';
process.env.JOURNAL_ONE_STORE = 'on'; // as on the prod web server (deploy/ui-server/env.yaml)

let server: Server;
let base: string;
const newUser = () => `u-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  if (!emulator) return;
  const { handleJournalRoutes } = await import('../journal-routes.js');
  server = createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://x');
    void handleJournalRoutes(req, res, pathname).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());
beforeEach(() => {
  process.env.JOURNAL_ONE_STORE = 'on';
});

interface PanelEntry {
  id: string;
  content: string;
  editable: boolean;
}

async function send(uid: string, method: string, path: string, body?: object) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(uid ? { 'x-test-uid': uid } : {}), 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** The panel's exact request (apps/web/src/ui/chronicle-entries.ui.ts chroniclePath). */
async function panelRead(uid: string) {
  const { status, body } = await send(uid, 'GET', `/api/journal/chronicle?userId=${uid}`);
  return { status, body, entries: (body.recentEntries ?? []) as PanelEntry[] };
}

/** What a call does when someone says "put this in my journal". */
async function callWrites(uid: string, text: string): Promise<string> {
  const { saveCallJournalEntry } = await import('../../tools/domains/productivity/call-journal.js');
  const ctx = { userData: { userId: uid, services: { sessionId: `call-${uid}` } } };
  return saveCallJournalEntry({ ctx }, text, 'journal');
}

const entryPath = (id: string) => `/api/journal/chronicle/entry/${encodeURIComponent(id)}`;

describe.skipIf(!emulator)('The Chronicle, call to panel (Firestore emulator)', () => {
  it('an entry kept in a call comes back to the panel, editable, with no streak card', async () => {
    const uid = newUser();
    expect(await callWrites(uid, 'Told my brother I was proud of him.')).toMatch(/^Saved/);
    await callWrites(uid, 'Slept well for once.');

    const { status, body, entries } = await panelRead(uid);
    expect(status).toBe(200);
    expect(entries.map((e) => [e.content, e.editable])).toEqual([
      ['Slept well for once.', true],
      ['Told my brother I was proud of him.', true],
    ]);
    expect(JSON.stringify(body.insights)).not.toMatch(/streak|archive|flame/i);
    expect(body.stats).not.toHaveProperty('currentStreak');
  });

  it('an edit is what the panel shows next', async () => {
    const uid = newUser();
    await callWrites(uid, 'Ran 3 miles.');
    const [entry] = (await panelRead(uid)).entries;

    const edited = await send(uid, 'PUT', entryPath(entry!.id), { content: 'Ran 5 miles.' });
    expect(edited.status).toBe(200);
    expect((await panelRead(uid)).entries.map((e) => e.content)).toEqual(['Ran 5 miles.']);
  });

  it('after DELETE the panel no longer returns the entry', async () => {
    const uid = newUser();
    await callWrites(uid, 'Something I want gone.');
    await callWrites(uid, 'Something I keep.');
    const before = (await panelRead(uid)).entries; // also fills the service's cache
    const gone = before.find((e) => e.content === 'Something I want gone.')!;

    const deleted = await send(uid, 'DELETE', `${entryPath(gone.id)}?userId=${uid}`);
    expect(deleted).toEqual({ status: 200, body: { deleted: true, id: gone.id } });
    expect((await panelRead(uid)).entries.map((e) => e.content)).toEqual(['Something I keep.']);
  });

  it("a migrated entry (also in its twin's old array) stays deleted", async () => {
    const uid = newUser();
    const { getAdminFirestore } = await import('../../utils/firebase-admin-app.js');
    const user = getAdminFirestore().collection('bogle_users').doc(uid);
    const old = {
      id: 'mem_old_1',
      content: 'From last spring.',
      createdAt: new Date('2026-04-01'),
    };
    const memories = { stories: [], wisdom: [], sharedMoments: [], journalEntries: [old] };
    await user
      .collection('custom_agents')
      .doc('twin-1')
      .set({ type: 'twin', name: 'Me', memories, updatedAt: new Date() });
    await user
      .collection('journal')
      .doc(old.id)
      .set({ ...old, agentId: 'twin-1' });
    expect((await panelRead(uid)).entries.map((e) => [e.id, e.editable])).toEqual([[old.id, true]]);

    expect((await send(uid, 'DELETE', entryPath(old.id))).status).toBe(200);
    expect((await panelRead(uid)).entries).toEqual([]);
  });

  it("another person's entry is never returned and can't be changed or deleted", async () => {
    const alice = newUser();
    const bob = newUser();
    await callWrites(bob, "Bob's private note.");
    const [bobs] = (await panelRead(bob)).entries;

    expect((await panelRead(alice)).entries).toEqual([]);
    expect((await send(alice, 'GET', `/api/journal/chronicle?userId=${bob}`)).status).toBe(403);
    expect((await send(alice, 'DELETE', entryPath(bobs!.id))).status).toBe(404);
    expect((await send(alice, 'DELETE', `${entryPath(bobs!.id)}?userId=${bob}`)).status).toBe(403);
    expect((await send(alice, 'PUT', entryPath(bobs!.id), { content: 'x' })).status).toBe(404);
    expect((await send('', 'DELETE', entryPath(bobs!.id))).status).toBe(401); // signed out
    expect((await panelRead(bob)).entries.map((e) => e.content)).toEqual(["Bob's private note."]);
  });

  it('a store failure is an error, not an empty Chronicle', async () => {
    const uid = newUser();
    await callWrites(uid, 'Anything.');
    const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
    const real = vi.mocked(getFirestoreDb).getMockImplementation()!;
    vi.mocked(getFirestoreDb).mockReturnValue(null);
    try {
      const { status, body } = await panelRead(uid);
      expect(status).toBe(500);
      expect(body).not.toHaveProperty('recentEntries');
    } finally {
      vi.mocked(getFirestoreDb).mockImplementation(real);
    }
  });
});
