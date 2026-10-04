/**
 * Journal sync contract: the web journal re-reads entries over REST.
 *
 * There is no /ws/journal-sync endpoint on the server. The old client opened
 * one anyway, and its polling fallback read `{ memories }` from a route that
 * returns a bare array, so neither path ever delivered a change.
 *
 * Here the REAL custom-agent route handler (handleCustomAgentRoutes, the one
 * the API server mounts and the voice journal already loads entries from)
 * runs on a real http server on port 0, behind its real requireAuth. Only the
 * Firebase verifier, persistence and the web's token source are mocked. The
 * REAL web journal-sync service fetches through it. Assertions are on the
 * change it reports.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Entry {
  id: string;
  type: 'journalEntry';
  content: string;
  createdAt: string;
}
const entry = (id: string): Entry => ({
  id,
  type: 'journalEntry',
  content: `entry ${id}`,
  createdAt: '2026-10-01T00:00:00.000Z',
});

const store = vi.hoisted(() => ({ journalEntries: [] as unknown[] }));
vi.mock('../../../../src/services/custom-agent/custom-agent-persistence-service.js', () => ({
  getCustomAgent: vi.fn(async (userId: string, agentId: string) =>
    userId === 'user-A' && agentId === 'agent-1'
      ? {
          id: 'agent-1',
          memories: {
            stories: [],
            wisdom: [],
            sharedMoments: [],
            journalEntries: store.journalEntries,
          },
        }
      : null
  ),
  createCustomAgent: vi.fn(),
  listCustomAgents: vi.fn(),
  updateCustomAgent: vi.fn(),
  deleteCustomAgent: vi.fn(),
  addMemoryToAgent: vi.fn(),
  removeMemoryFromAgent: vi.fn(),
  updateAgentVoice: vi.fn(),
}));
vi.mock('../../../../src/services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-user-A' ? { uid: 'user-A', claims: {} } : null
  ),
}));
vi.mock('../../src/services/firebase-auth.service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getAuthToken: async () => 'tok-user-A',
}));

const { handleCustomAgentRoutes } = await import('../../../../src/api/custom-agent/index.js');
const sync = await import('../../src/services/journal-sync.service.js');

let http: Server | null = null;
const realFetch = globalThis.fetch;
const requests: string[] = [];

beforeEach(async () => {
  const s = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleCustomAgentRoutes(req, res, url.pathname, url);
  });
  http = s;
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve));
  const { port } = s.address() as AddressInfo;
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
    requests.push(input);
    return realFetch(`http://127.0.0.1:${port}${input}`, init);
  });
});

afterEach(async () => {
  sync.stopJournalSync();
  vi.unstubAllGlobals();
  requests.length = 0;
  store.journalEntries = [];
  await new Promise<void>((resolve) => (http ? http.close(() => resolve()) : resolve()));
  http = null;
});

describe('journal sync over the custom-agent REST route', () => {
  it('reports an entry written elsewhere when the window regains focus', async () => {
    let shown: Entry[] = [entry('e1')];
    const changes: Array<{ added: number; removed: number; ids: string[] }> = [];
    store.journalEntries = [entry('e1'), entry('e2')];

    sync.startJournalSync(
      'agent-1',
      () => shown,
      (change) => {
        changes.push({
          added: change.added,
          removed: change.removed,
          ids: change.entries.map((e) => e.id),
        });
        shown = change.entries as Entry[];
      }
    );
    window.dispatchEvent(new Event('focus'));

    await vi.waitFor(() => expect(changes).toHaveLength(1));
    expect(changes[0]).toEqual({ added: 1, removed: 0, ids: ['e1', 'e2'] });
    expect(requests).toEqual(['/api/custom-agents/agent-1/memories?type=journalEntry']);

    // Deleted on another device: reported as removed on the next check.
    store.journalEntries = [entry('e2')];
    await sync.checkJournalForChanges();
    expect(changes[1]).toEqual({ added: 0, removed: 1, ids: ['e2'] });
  });

  it('says nothing when the journal already shows what the server has', async () => {
    store.journalEntries = [entry('e1')];
    const onChange = vi.fn();
    sync.startJournalSync('agent-1', () => [entry('e1')], onChange);

    expect(await sync.checkJournalForChanges()).toBeNull();
    expect(requests).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stops fetching once the journal closes', async () => {
    sync.startJournalSync('agent-1', () => [], vi.fn());
    sync.stopJournalSync();
    window.dispatchEvent(new Event('focus'));
    expect(await sync.checkJournalForChanges()).toBeNull();
    expect(requests).toHaveLength(0);
  });

  it('opens no WebSocket', async () => {
    const opened = vi.fn();
    vi.stubGlobal('WebSocket', opened);
    sync.startJournalSync('agent-1', () => [], vi.fn());
    await sync.checkJournalForChanges();
    expect(opened).not.toHaveBeenCalled();
  });
});
