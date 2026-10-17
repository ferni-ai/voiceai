/**
 * DELETE /api/custom-agents/:id/memories/:memoryId removes the memory even when
 * the client sends no ?type= (the web client never did, so every panel delete
 * was a 400 on prod). The type is found on the caller's own agent only.
 */
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeFirestore,
  newFakeFirestoreState,
  resetFakeFirestore,
} from '../../../tests/helpers/fake-firestore.js';

type Mem = { id: string; content: string };
const h = vi.hoisted(() => ({
  state: undefined as unknown as ReturnType<typeof newFakeFirestoreState>,
  agents: new Map<string, { id: string; type: string; memories: Record<string, Mem[]> }>(),
}));
h.state = newFakeFirestoreState();
const db = createFakeFirestore(h.state)()!;

vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getFirestoreDb: () => db,
}));
vi.mock('../../../services/custom-agent/custom-agent-persistence-service.js', () => ({
  getCustomAgent: vi.fn(async (uid: string, id: string) => h.agents.get(`${uid}/${id}`) ?? null),
  listCustomAgents: vi.fn(async () => []),
  addMemoryToAgent: vi.fn(),
  removeMemoryFromAgent: vi.fn(async (uid: string, id: string, key: string, memId: string) => {
    const agent = h.agents.get(`${uid}/${id}`);
    if (!agent) return null;
    agent.memories[key] = (agent.memories[key] ?? []).filter((m) => m.id !== memId);
    return agent;
  }),
}));

const { handleDeleteMemory } = await import('../memory-routes.js');

async function del(uid: string, agentId: string, memoryId: string, query = '') {
  const req = new EventEmitter() as IncomingMessage;
  let status = 0;
  const res = {
    writeHead: vi.fn((code: number) => (status = code)),
    setHeader: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse;
  const url = new URL(`http://local/api/custom-agents/${agentId}/memories/${memoryId}${query}`);
  await handleDeleteMemory(req, res, uid, agentId, memoryId, url);
  return status;
}

const twin = () => h.agents.get('uid-1/twin-1')!;

beforeEach(() => {
  resetFakeFirestore(h.state);
  h.agents.clear();
  h.agents.set('uid-1/twin-1', {
    id: 'twin-1',
    type: 'twin',
    memories: {
      stories: [{ id: 'story_1', content: 'The summer in Maine.' }],
      wisdom: [],
      sharedMoments: [],
      journalEntries: [{ id: 'mem_1', content: 'Walked by the lake.' }],
    },
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('deleting a memory without ?type=', () => {
  it('a panel delete removes the journal entry', async () => {
    expect(await del('uid-1', 'twin-1', 'mem_1')).toBe(204);
    expect(twin().memories.journalEntries).toEqual([]);
    expect(twin().memories.stories).toHaveLength(1);
  });

  it('finds a story the same way', async () => {
    expect(await del('uid-1', 'twin-1', 'story_1')).toBe(204);
    expect(twin().memories.stories).toEqual([]);
    expect(twin().memories.journalEntries).toHaveLength(1);
  });

  it("an id the agent doesn't hold is a 404 and removes nothing", async () => {
    expect(await del('uid-1', 'twin-1', 'nope')).toBe(404);
    expect(twin().memories.journalEntries).toHaveLength(1);
  });

  it("someone else's agent is a 404", async () => {
    expect(await del('uid-other', 'twin-1', 'mem_1')).toBe(404);
    expect(twin().memories.journalEntries).toHaveLength(1);
  });

  it('with JOURNAL_ONE_STORE on, removes an entry that lives only in the journal store', async () => {
    vi.stubEnv('JOURNAL_ONE_STORE', 'on');
    await db
      .collection('bogle_users/uid-1/journal')
      .doc('journal_9')
      .set({ content: 'Only here.' });

    expect(await del('uid-1', 'twin-1', 'journal_9')).toBe(204);
    expect(h.state.docs.has('bogle_users/uid-1/journal/journal_9')).toBe(false);
  });

  it('an explicit ?type= still works', async () => {
    expect(await del('uid-1', 'twin-1', 'mem_1', '?type=journalEntry')).toBe(204);
    expect(twin().memories.journalEntries).toEqual([]);
  });
});
