/**
 * JOURNAL_ONE_STORE: the Chronicle, the Voice Journal panel (POST/GET
 * /memories) and talk-to-twin (which reads GET /memories?type=journalEntry)
 * meet in bogle_users/{uid}/journal.
 *
 * Journal audit 2026-10-13: an entry written through one surface never showed
 * up in another. Each test here writes through one surface's real handler and
 * reads the text back through a different one, against one in-memory Firestore.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeFirestore,
  newFakeFirestoreState,
  resetFakeFirestore,
} from '../../../tests/helpers/fake-firestore.js';

const h = vi.hoisted(() => ({
  state: undefined as unknown as ReturnType<typeof newFakeFirestoreState>,
  agents: new Map<string, Record<string, unknown>>(),
  caller: { uid: '' },
  productivityWrites: [] as unknown[],
}));
h.state = newFakeFirestoreState();
const db = createFakeFirestore(h.state)()!;

vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getFirestoreDb: () => db,
}));
vi.mock('../../custom-agent/custom-agent-persistence-service.js', () => ({
  getCustomAgent: vi.fn(async (uid: string, id: string) => h.agents.get(`${uid}/${id}`) ?? null),
  listCustomAgents: vi.fn(async (uid: string) =>
    [...h.agents.entries()].filter(([k]) => k.startsWith(`${uid}/`)).map(([, a]) => a)
  ),
  addMemoryToAgent: vi.fn(async (uid: string, id: string, _type: string, memory: object) => {
    const agent = h.agents.get(`${uid}/${id}`) as { memories: { journalEntries: object[] } };
    agent.memories.journalEntries.push({
      ...memory,
      id: `mem_${Date.now()}`,
      createdAt: new Date(),
    });
    return agent;
  }),
  removeMemoryFromAgent: vi.fn(async (uid: string, id: string, _type: string, memId: string) => {
    const agent = h.agents.get(`${uid}/${id}`) as
      { memories: { journalEntries: Array<{ id: string }> } } | undefined;
    if (!agent) return null;
    agent.memories.journalEntries = agent.memories.journalEntries.filter((m) => m.id !== memId);
    return agent;
  }),
}));
vi.mock('../../stores/productivity-store.js', () => ({
  getProductivityStore: () => ({
    loadUserData: async () => undefined,
    getUserJournalEntries: () => [],
    getUserNotes: () => [],
    setNote: (_uid: string, note: unknown) => h.productivityWrites.push(note),
    setJournalEntry: (_uid: string, entry: unknown) => h.productivityWrites.push(entry),
  }),
}));
vi.mock('../../../api/auth-middleware.js', () => ({
  requireAuth: async () => ({ userId: h.caller.uid }),
}));

const { handleAddMemory, handleListMemories, handleDeleteMemory } =
  await import('../../../api/custom-agent/memory-routes.js');
const { handleJournalRoutes } = await import('../../../api/journal-routes.js');

let n = 0;
let uid = '';
let twinId = '';

function call(method: string, url: string, body?: unknown) {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { host: 'local' };
  let status = 0;
  let raw = '';
  const res = {
    writeHead: vi.fn((code: number) => (status = code)),
    setHeader: vi.fn(),
    end: vi.fn((data?: string) => (raw = data ?? '')),
  } as unknown as ServerResponse;
  setTimeout(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
  return { req, res, result: () => ({ status, body: raw ? JSON.parse(raw) : null }) };
}

function addAgent(owner: string, id: string, type: string, journalEntries: object[] = []) {
  h.agents.set(`${owner}/${id}`, {
    id,
    type,
    memories: { stories: [], wisdom: [], sharedMoments: [], journalEntries },
  });
}

/** The Voice Journal panel's save: POST /api/custom-agents/:id/memories. */
async function panelWrite(owner: string, agentId: string, content: string) {
  const c = call('POST', `/api/custom-agents/${agentId}/memories`, {
    type: 'journalEntry',
    content,
    mood: 'happy',
  });
  await handleAddMemory(c.req, c.res, owner, agentId);
  return c.result();
}

/** What the panel and talk-to-twin list: GET /memories?type=journalEntry. */
async function panelRead(owner: string, agentId: string) {
  const url = `/api/custom-agents/${agentId}/memories?type=journalEntry`;
  const c = call('GET', url);
  await handleListMemories(c.req, c.res, owner, agentId, new URL(url, 'http://local'));
  const { status, body } = c.result();
  return {
    status,
    texts: Array.isArray(body) ? body.map((m: { content: string }) => m.content) : [],
  };
}

async function chronicleWrite(owner: string, content: string) {
  h.caller.uid = owner;
  const c = call('POST', '/api/journal/chronicle/entry', { content, type: 'text', agentId: null });
  await handleJournalRoutes(c.req, c.res, '/api/journal/chronicle/entry');
  return c.result();
}

async function chronicleRead(owner: string) {
  h.caller.uid = owner;
  const c = call('GET', '/api/journal/chronicle');
  await handleJournalRoutes(c.req, c.res, '/api/journal/chronicle');
  const { status, body } = c.result();
  return { status, texts: (body?.recentEntries ?? []).map((e: { content: string }) => e.content) };
}

const journalWrites = () => h.state.writes.filter((w) => w.path.includes('/journal/'));

beforeEach(() => {
  resetFakeFirestore(h.state);
  h.agents.clear();
  h.productivityWrites.length = 0;
  n++;
  uid = `user-${n}`; // fresh uid per test: the JournalService cache is per uid
  twinId = `twin-${n}`;
  addAgent(uid, twinId, 'twin');
  vi.stubEnv('JOURNAL_ONE_STORE', 'on');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('one journal store, across surfaces', () => {
  it('a Voice Journal panel entry shows up in the Chronicle', async () => {
    expect((await panelWrite(uid, twinId, 'Walked by the lake at dawn.')).status).toBe(201);

    expect(journalWrites().map((w) => w.path)).toEqual([
      expect.stringMatching(`^bogle_users/${uid}/journal/`),
    ]);
    expect(journalWrites()[0].data).toMatchObject({
      agentId: twinId,
      content: 'Walked by the lake at dawn.',
    });
    expect((await chronicleRead(uid)).texts).toContain('Walked by the lake at dawn.');
  });

  it('a Chronicle entry shows up in the panel and in what talk-to-twin reads', async () => {
    expect((await chronicleWrite(uid, 'Called my sister tonight.')).status).toBe(201);

    expect(h.productivityWrites).toEqual([]); // not one UI instance's RAM
    expect((await panelRead(uid, twinId)).texts).toEqual(['Called my sister tonight.']);
  });

  it("an entry written with one agent stays out of a different agent's list", async () => {
    addAgent(uid, 'coach-1', 'custom');
    await panelWrite(uid, 'coach-1', 'Notes for my coach.');
    await panelWrite(uid, twinId, 'Notes for my past self.');

    expect((await panelRead(uid, twinId)).texts).toEqual(['Notes for my past self.']);
    expect((await panelRead(uid, 'coach-1')).texts).toEqual(['Notes for my coach.']);
  });

  it('entries saved before the switch still show, once each, next to a copy with the same id', async () => {
    const old = {
      id: 'mem_old_1',
      content: 'From last spring.',
      mood: 'calm',
      createdAt: new Date('2026-04-01'),
    };
    addAgent(uid, twinId, 'twin', [old]);

    expect((await panelRead(uid, twinId)).texts).toEqual(['From last spring.']);
    expect((await chronicleRead(uid)).texts).toContain('From last spring.');

    // A migrated copy keeps the id: still one entry, not two.
    await db
      .collection(`bogle_users/${uid}/journal`)
      .doc('mem_old_1')
      .set({ ...old, agentId: twinId });
    expect((await panelRead(uid, twinId)).texts).toEqual(['From last spring.']);
  });

  it('deleting an entry that is in both the array and the store removes both copies', async () => {
    const old = { id: 'mem_old_1', content: 'Delete me.', createdAt: new Date('2026-04-01') };
    addAgent(uid, twinId, 'twin', [old]);
    await db
      .collection(`bogle_users/${uid}/journal`)
      .doc('mem_old_1')
      .set({ ...old, agentId: twinId });

    const url = `/api/custom-agents/${twinId}/memories/mem_old_1?type=journalEntry`;
    const c = call('DELETE', url);
    await handleDeleteMemory(c.req, c.res, uid, twinId, 'mem_old_1', new URL(url, 'http://local'));

    expect(c.result().status).toBe(204);
    expect((await panelRead(uid, twinId)).texts).toEqual([]);
    expect((await chronicleRead(uid)).texts).not.toContain('Delete me.');
  });
});

describe('owner-only', () => {
  it("another person can't read an entry through any surface", async () => {
    const other = `${uid}-other`;
    addAgent(other, `${twinId}-other`, 'twin');
    await panelWrite(uid, twinId, 'Private: only mine.');

    expect((await chronicleRead(other)).texts).not.toContain('Private: only mine.');
    expect((await panelRead(other, `${twinId}-other`)).texts).toEqual([]);
    expect((await panelRead(other, twinId)).status).toBe(404); // someone else's agent id
    expect((await chronicleRead(uid)).texts).toContain('Private: only mine.');
  });
});

describe('with JOURNAL_ONE_STORE off', () => {
  it('the panel still writes the agent array and the Chronicle still writes the old place', async () => {
    vi.stubEnv('JOURNAL_ONE_STORE', 'off');
    await panelWrite(uid, twinId, 'Old path.');
    await chronicleWrite(uid, 'Old chronicle path.');

    expect(journalWrites()).toEqual([]);
    const agent = h.agents.get(`${uid}/${twinId}`) as {
      memories: { journalEntries: Array<{ content: string }> };
    };
    expect(agent.memories.journalEntries.map((e) => e.content)).toEqual(['Old path.']);
    expect(h.productivityWrites).toHaveLength(1); // no agentId: the ProductivityStore, as before
  });
});
