/**
 * With JOURNAL_ONE_STORE on, the twin card's count and streak and the agent
 * editor (which read `memories.journalEntries` off GET /api/custom-agents[/:id])
 * see the store's entries, merged with the old array and deduped, and a PUT
 * that echoes that list back doesn't write it into the array. A panel write is
 * visible to the Chronicle's next read on the same instance.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeFirestore,
  newFakeFirestoreState,
  resetFakeFirestore,
} from '../../../tests/helpers/fake-firestore.js';

type Agent = { id: string; type: string; memories: Record<string, unknown[]> };
const h = vi.hoisted(() => ({
  state: undefined as unknown as ReturnType<typeof newFakeFirestoreState>,
  agents: new Map<string, Agent>(),
  updates: [] as unknown[],
}));
h.state = newFakeFirestoreState();
const db = createFakeFirestore(h.state)()!;

vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getFirestoreDb: () => db,
}));
vi.mock('../../../services/custom-agent/custom-agent-persistence-service.js', () => ({
  getCustomAgent: vi.fn(async (uid: string, id: string) => h.agents.get(`${uid}/${id}`) ?? null),
  listCustomAgents: vi.fn(async (uid: string) =>
    [...h.agents.entries()].filter(([k]) => k.startsWith(`${uid}/`)).map(([, a]) => a)
  ),
  updateCustomAgent: vi.fn(async (uid: string, id: string, data: unknown) => {
    h.updates.push(data);
    return h.agents.get(`${uid}/${id}`) ?? null;
  }),
  addMemoryToAgent: vi.fn(),
  removeMemoryFromAgent: vi.fn(),
  createCustomAgent: vi.fn(),
  deleteCustomAgent: vi.fn(),
}));
vi.mock('../../../services/stores/productivity-store.js', () => ({
  getProductivityStore: () => ({
    loadUserData: async () => undefined,
    getUserJournalEntries: () => [],
    getUserNotes: () => [],
  }),
}));

const { handleGetAgent, handleListAgents, handleUpdateAgent } = await import('../agent-routes.js');
const { handleAddMemory } = await import('../memory-routes.js');
const { useJournalEntryStore } = await import('../../../services/journal/journal-ports.js');
const { firestoreJournalStore } = await import('../../../services/stores/journal-store.js');
const { getJournalService } = await import('../../../services/journal/index.js');
useJournalEntryStore(firestoreJournalStore);

function call(body?: unknown) {
  const req = new EventEmitter() as IncomingMessage;
  req.headers = {};
  let raw = '';
  const res = {
    writeHead: vi.fn(),
    setHeader: vi.fn(),
    end: vi.fn((data?: string) => (raw = data ?? '')),
  } as unknown as ServerResponse;
  setTimeout(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
  return { req, res, json: () => (raw ? JSON.parse(raw) : null) };
}

let n = 0;
let uid = '';
const contents = (agent: { memories: { journalEntries?: Array<{ content: string }> } }) =>
  (agent.memories.journalEntries ?? []).map((e) => e.content);

beforeEach(async () => {
  resetFakeFirestore(h.state);
  h.agents.clear();
  h.updates.length = 0;
  uid = `uid-${++n}`; // the JournalService cache is per uid
  const old = { id: 'mem_old', content: 'From last spring.', createdAt: new Date('2026-04-01') };
  h.agents.set(`${uid}/twin-1`, {
    id: 'twin-1',
    type: 'twin',
    memories: { stories: [], wisdom: [], sharedMoments: [], journalEntries: [old] },
  });
  vi.stubEnv('JOURNAL_ONE_STORE', 'on');
  await db
    .collection(`bogle_users/${uid}/journal`)
    .doc('mem_old')
    .set({ ...old, agentId: 'twin-1' });
  await db
    .collection(`bogle_users/${uid}/journal`)
    .doc('journal_new')
    .set({ content: 'Called my sister tonight.', createdAt: new Date('2026-10-01') });
});
afterEach(() => vi.unstubAllEnvs());

describe('agent routes show the store journal', () => {
  it('GET /:id counts store entries, merged with the array, once each', async () => {
    const c = call();
    await handleGetAgent(c.req, c.res, uid, 'twin-1');
    expect(contents(c.json())).toEqual(['Called my sister tonight.', 'From last spring.']);
  });

  it('GET / (the twin card list) does the same', async () => {
    const c = call();
    await handleListAgents(c.req, c.res, uid);
    expect(contents(c.json()[0])).toEqual(['Called my sister tonight.', 'From last spring.']);
  });

  it('a PUT that echoes the list back does not write it into the array', async () => {
    const c = call({
      memories: { relationships: [], journalEntries: [{ id: 'x', content: 'echo' }] },
    });
    await handleUpdateAgent(c.req, c.res, uid, 'twin-1');
    expect(h.updates).toEqual([{ memories: { relationships: [] } }]);
    expect(contents(c.json())).toContain('Called my sister tonight.');
  });

  it('with the flag off, GET shows the array as before', async () => {
    vi.stubEnv('JOURNAL_ONE_STORE', 'off');
    const c = call();
    await handleGetAgent(c.req, c.res, uid, 'twin-1');
    expect(contents(c.json())).toEqual(['From last spring.']);
  });
});

describe('the Chronicle cache after a panel write', () => {
  it('the next read on the same instance shows the new entry', async () => {
    const before = await getJournalService().getAllEntries(uid);
    expect(before.map((e) => e.content)).not.toContain('Walked by the lake.');

    const c = call({ type: 'journalEntry', content: 'Walked by the lake.' });
    await handleAddMemory(c.req, c.res, uid, 'twin-1');

    const after = await getJournalService().getAllEntries(uid);
    expect(after.map((e) => e.content)).toContain('Walked by the lake.');
  });
});
