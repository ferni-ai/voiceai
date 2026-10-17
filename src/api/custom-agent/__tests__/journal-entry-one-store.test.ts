/**
 * With JOURNAL_ONE_STORE on, the dormant audio route
 * (POST /api/custom-agents/:id/journal/entry) writes the one journal store,
 * not the twin's array, and GET .../journal/entries reads it back, so nothing
 * new lands in the old arrays. The flag-off path stays covered by
 * journal-placeholder-routes.test.ts ("saves the words when there is a transcript").
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
  twin: { id: 'twin-1', type: 'twin', memories: { journalEntries: [] as object[] } },
  addMemoryToAgent: vi.fn(async () => ({ id: 'twin-1' }) as unknown),
}));
h.state = newFakeFirestoreState();
const db = createFakeFirestore(h.state)()!;

vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getFirestoreDb: () => db,
}));
vi.mock('../../../services/custom-agent/custom-agent-persistence-service.js', () => ({
  getCustomAgent: vi.fn(async (uid: string, id: string) =>
    uid === 'uid-1' && id === 'twin-1' ? h.twin : null
  ),
  listCustomAgents: vi.fn(async () => [h.twin]),
  addMemoryToAgent: h.addMemoryToAgent,
  removeMemoryFromAgent: vi.fn(),
}));
vi.mock('../../../services/custom-agent/gcs-storage-service.js', () => ({
  uploadVoiceJournalEntry: vi.fn(async () => null),
}));
vi.mock('../../../services/custom-agent/memory-capture-service.js', () => ({
  transcribeAudioBuffer: vi.fn(async () => 'Walked by the lake.'),
  extractMetadata: vi.fn(async () => ({ themes: ['calm'], emotions: [], keyPhrases: [] })),
}));

const { handleCreateJournalEntry, handleListJournalEntries } = await import('../journal-routes.js');
const { handleListMemories } = await import('../memory-routes.js');

function call(body?: unknown) {
  const req = new EventEmitter() as IncomingMessage;
  req.method = body === undefined ? 'GET' : 'POST';
  req.headers = {};
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

const audio = Buffer.from('fake audio').toString('base64');

beforeEach(() => {
  resetFakeFirestore(h.state);
  h.addMemoryToAgent.mockClear();
  vi.stubEnv('JOURNAL_ONE_STORE', 'on');
});
afterEach(() => vi.unstubAllEnvs());

describe('the audio journal route with JOURNAL_ONE_STORE on', () => {
  it('writes the store, tagged with the twin, and not the agent array', async () => {
    const post = call({ audio, mood: 'calm' });
    await handleCreateJournalEntry(post.req, post.res, 'uid-1', 'twin-1');

    expect(post.result().status).toBe(201);
    expect(h.addMemoryToAgent).not.toHaveBeenCalled();
    const writes = h.state.writes.filter((w) => w.path.startsWith('bogle_users/uid-1/journal/'));
    expect(writes).toHaveLength(1);
    expect(writes[0].data).toMatchObject({ content: 'Walked by the lake.', agentId: 'twin-1' });
  });

  it('what it writes is listed by its own route and by the panel', async () => {
    const post = call({ audio });
    await handleCreateJournalEntry(post.req, post.res, 'uid-1', 'twin-1');

    const own = call();
    const url = new URL('http://local/api/custom-agents/twin-1/journal/entries');
    await handleListJournalEntries(own.req, own.res, 'uid-1', 'twin-1', url);
    expect(own.result().body).toMatchObject({
      total: 1,
      entries: [{ content: 'Walked by the lake.' }],
    });

    const panel = call();
    const panelUrl = new URL('http://local/api/custom-agents/twin-1/memories?type=journalEntry');
    await handleListMemories(panel.req, panel.res, 'uid-1', 'twin-1', panelUrl);
    expect(panel.result().body.map((m: { content: string }) => m.content)).toEqual([
      'Walked by the lake.',
    ]);
  });
});
