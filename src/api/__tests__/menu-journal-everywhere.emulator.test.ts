/**
 * A Chronicle edit or delete holds everywhere Ferni reads the entry (Firestore emulator).
 *
 * #2782's verifier (2026-10-25) found the old words outliving an edit: a voice entry kept
 * the title, keywords and themes from its first transcript, so journal search still found
 * it by the old title; an addJournal entry kept its text in `entry`, which getJournals
 * reads. A delete removed the store copy before the twin's array copy, so a failure between
 * them brought the entry back as an old row the Chronicle can't change; it left the
 * recording in storage; and a call's journal history read a 60 s cache that an edit or
 * delete in the API process never clears. `__name__` and a non-JSON body were 500s.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// src/tests/setup.ts fakes firebase-admin and getFirestoreDb for every test; the routes,
// the tools and the executor read through them, so this file swaps the real ones back in.
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../utils/firestore-utils.js', async () => {
  const actual = await vi.importActual<typeof import('../../utils/firestore-utils.js')>(
    '../../utils/firestore-utils.js'
  );
  return { ...actual, getFirestoreDb: vi.fn(actual.getFirestoreDb) };
});
// A request carrying x-test-uid is signed in as that user (a verified token's uid).
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
// No storage emulator: the recording delete is checked at its call (its own test lists files).
const deleteAudio = vi.hoisted(() => vi.fn(async () => 1));
vi.mock('../../services/custom-agent/gcs-storage-service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/custom-agent/gcs-storage-service.js')>()),
  deleteVoiceJournalAudio: deleteAudio,
}));

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
  deleteAudio.mockClear();
});

async function send(uid: string, method: string, path: string, body?: object | string) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'x-test-uid': uid, 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

interface PanelEntry {
  id: string;
  content: string;
  editable: boolean;
}

/** The panel's exact request (apps/web/src/ui/chronicle-entries.ui.ts chroniclePath). */
async function panel(uid: string): Promise<PanelEntry[]> {
  const { body } = await send(uid, 'GET', `/api/journal/chronicle?userId=${uid}`);
  return (body.recentEntries ?? []) as PanelEntry[];
}

const entryPath = (id: string) => `/api/journal/chronicle/entry/${encodeURIComponent(id)}`;

async function userDoc(uid: string) {
  const { getAdminFirestore } = await import('../../utils/firebase-admin-app.js');
  return getAdminFirestore().collection('bogle_users').doc(uid);
}

async function storeDoc(uid: string, id: string) {
  return (await (await userDoc(uid)).collection('journal').doc(id).get()).data();
}

/** A twin whose old `memories.journalEntries` array holds these entries. */
async function twinWith(uid: string, journalEntries: object[]) {
  const memories = { stories: [], wisdom: [], sharedMoments: [], journalEntries };
  await (
    await userDoc(uid)
  )
    .collection('custom_agents')
    .doc('twin-1')
    .set({ type: 'twin', name: 'Me', memories, updatedAt: new Date() });
}

/**
 * Every write to a custom agent document throws, however it is made (a document
 * write, a batch or a transaction), until the returned function restores them.
 */
async function failAgentWrites(): Promise<() => void> {
  const { DocumentReference, Transaction, WriteBatch } = await import('firebase-admin/firestore');
  type Proto = Record<'set' | 'update', (...args: unknown[]) => unknown>;
  const restores: Array<() => void> = [];
  const wrap = (proto: Proto, pathOf: (self: unknown, args: unknown[]) => string) => {
    for (const method of ['set', 'update'] as const) {
      const original = proto[method];
      proto[method] = function (this: unknown, ...args: unknown[]) {
        if (pathOf(this, args).includes('/custom_agents/')) throw new Error('agent write failed');
        return original.apply(this, args);
      };
      restores.push(() => (proto[method] = original));
    }
  };
  const refPath = (_self: unknown, args: unknown[]) => (args[0] as { path: string }).path;
  wrap(DocumentReference.prototype as unknown as Proto, (self) => (self as { path: string }).path);
  wrap(WriteBatch.prototype as unknown as Proto, refPath);
  wrap(Transaction.prototype as unknown as Proto, refPath);
  return () => restores.forEach((restore) => restore());
}

describe.skipIf(!emulator)('A Chronicle edit or delete, everywhere (Firestore emulator)', () => {
  it("an edited voice entry keeps none of its first transcript's words", async () => {
    const uid = newUser();
    const id = 'journal_voice_1';
    const words = 'Walked to the lighthouse with Dana.';
    await (
      await userDoc(uid)
    )
      .collection('journal')
      .doc(id)
      .set({
        content: words,
        transcript: words,
        title: 'Lighthouse walk with Dana',
        keywords: ['lighthouse', 'Dana'],
        themes: ['friendship'],
        emotions: ['calm'],
        summary: 'A walk to the lighthouse with Dana.',
        embedding: [0.1, 0.2],
        mood: 'calm',
        agentId: 'twin-1',
        source: 'digital_twin',
        createdAt: new Date(),
      });
    const search = async (q: string) =>
      (await send(uid, 'GET', `/api/journal/search?q=${q}`)).body.count;
    expect(await search('lighthouse')).toBe(1); // found by its old words before the edit

    expect((await send(uid, 'PUT', entryPath(id), { content: 'Walked to the pier.' })).status).toBe(
      200
    );
    for (const old of ['lighthouse', 'dana', 'friendship']) expect(await search(old)).toBe(0);
    expect(await search('pier')).toBe(1);
    const doc = await storeDoc(uid, id);
    expect(Object.keys(doc ?? {}).sort()).toEqual(
      ['agentId', 'content', 'createdAt', 'mood', 'source', 'updatedAt'].sort()
    );
  });

  it('an edited addJournal entry is what getJournals reads', async () => {
    const uid = newUser();
    const { productivityExecutor } =
      await import('../../agents/shared/tool-executors/productivity-executor.js');
    const ctx = { userId: uid };
    await productivityExecutor.execute('addJournal', { entry: 'Fought with Sam.' }, ctx);
    const [entry] = await panel(uid);
    expect(entry).toMatchObject({ content: 'Fought with Sam.', editable: true });

    await send(uid, 'PUT', entryPath(entry!.id), { content: 'Talked it through with Sam.' });
    const read = String(await productivityExecutor.execute('getJournals', {}, ctx));
    expect(read).toContain('Talked it through');
    expect(read).not.toContain('Fought');
    expect(await storeDoc(uid, entry!.id)).not.toHaveProperty('entry');
  });

  it("a delete that can't change the twin's array changes nothing", async () => {
    const uid = newUser();
    const old = {
      id: 'mem_old_1',
      content: 'From last spring.',
      createdAt: new Date('2026-04-01'),
    };
    await twinWith(uid, [old]);
    await (
      await userDoc(uid)
    )
      .collection('journal')
      .doc(old.id)
      .set({ ...old, agentId: 'twin-1' });

    const restore = await failAgentWrites();
    try {
      expect((await send(uid, 'DELETE', entryPath(old.id))).status).toBe(500);
    } finally {
      restore();
    }
    // Still the one editable entry, not an old row the Chronicle can't change
    expect((await panel(uid)).map((e) => [e.id, e.editable])).toEqual([[old.id, true]]);
    expect(deleteAudio).not.toHaveBeenCalled();

    expect((await send(uid, 'DELETE', entryPath(old.id))).status).toBe(200);
    expect(await panel(uid)).toEqual([]);
    expect(deleteAudio).toHaveBeenCalledWith(uid, 'twin-1', old.id);
  });

  it('deleting a voice entry deletes its recording, from the Chronicle and the twin', async () => {
    const uid = newUser();
    const twins = { id: 'journal_arr_1', content: 'Only in the array.', createdAt: new Date() };
    await twinWith(uid, [twins]);
    await (
      await userDoc(uid)
    )
      .collection('journal')
      .doc('journal_store_1')
      .set({ content: 'A voice entry.', agentId: 'twin-1', createdAt: new Date() });
    await (
      await userDoc(uid)
    )
      .collection('journal')
      .doc('typed_1')
      .set({ content: 'Typed, no recording.', createdAt: new Date() });

    await send(uid, 'DELETE', entryPath('journal_store_1'));
    await send(uid, 'DELETE', entryPath('typed_1'));
    expect(deleteAudio.mock.calls).toEqual([[uid, 'twin-1', 'journal_store_1']]);

    const { handleDeleteMemory } = await import('../custom-agent/memory-routes.js');
    const res = { writeHead: vi.fn(), end: vi.fn(), setHeader: vi.fn() };
    const url = new URL('http://x/?type=journalEntry');
    await handleDeleteMemory({} as never, res as never, uid, 'twin-1', twins.id, url);
    expect(res.writeHead).toHaveBeenCalledWith(204);
    expect(deleteAudio).toHaveBeenLastCalledWith(uid, 'twin-1', twins.id);
  });

  it("a call's journal history doesn't serve an entry another process deleted", async () => {
    const uid = newUser();
    const { saveCallJournalEntry, journalHistory } =
      await import('../../tools/domains/productivity/call-journal.js');
    const opts = { ctx: { userData: { userId: uid, services: { sessionId: `call-${uid}` } } } };
    await saveCallJournalEntry(opts, 'Kept this one.', 'journal');
    await saveCallJournalEntry(opts, 'Took this one back.', 'journal');
    expect(await journalHistory(opts)).toContain('Took this one back.'); // fills the cache

    // The API process deletes it; its cache clear (journalChanged) never reaches this one
    const gone = (await panel(uid)).find((e) => e.content === 'Took this one back.')!;
    await (await userDoc(uid)).collection('journal').doc(gone.id).delete();
    const history = await journalHistory(opts);
    expect(history).toContain('Kept this one.');
    expect(history).not.toContain('Took this one back.');
  });

  it('an entry is at most 10,000 characters, and only store entries are editable', async () => {
    const uid = newUser();
    await twinWith(uid, [{ id: 'arr_only', content: 'Old array entry.', createdAt: new Date(0) }]);
    await (
      await userDoc(uid)
    )
      .collection('journal')
      .doc('in_store')
      .set({ content: 'Short.', createdAt: new Date() });
    expect((await panel(uid)).map((e) => [e.id, e.editable])).toEqual([
      ['in_store', true],
      ['arr_only', false],
    ]);

    const longest = 'x'.repeat(10_000);
    expect((await send(uid, 'PUT', entryPath('in_store'), { content: longest })).status).toBe(200);
    const tooLong = { content: `${longest}y` };
    expect((await send(uid, 'PUT', entryPath('in_store'), tooLong)).status).toBe(400);
    expect((await storeDoc(uid, 'in_store'))?.content).toBe(longest);
  });

  it('a reserved id or a body that is not JSON is a 400, not a 500', async () => {
    const uid = newUser();
    await (
      await userDoc(uid)
    )
      .collection('journal')
      .doc('kept')
      .set({ content: 'Unchanged.', createdAt: new Date() });

    expect((await send(uid, 'PUT', entryPath('__name__'), { content: 'x' })).status).toBe(400);
    expect((await send(uid, 'DELETE', entryPath('__name__'))).status).toBe(400);
    expect((await send(uid, 'PUT', entryPath('kept'), 'not json {')).status).toBe(400);
    expect((await storeDoc(uid, 'kept'))?.content).toBe('Unchanged.');
  });
});
