/**
 * "When We've Talked" (history), call → panel: a call the voice agent records
 * (realtime-memory, bogle_users/{uid}/conversations) comes back through
 * GET /api/conversations, the route the panel calls (apps/web/src/app/panel-methods.ts).
 * The route used to read only engagement_profiles/{uid}/conversation_sessions, which
 * just the web app's hang-up POST writes, so phone calls never showed, and a store
 * failure came back as an empty, "never talked" history.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// src/tests/setup.ts fakes firebase-admin and getFirestoreDb for every test; the agent's
// writer and the route read through them, so this file swaps the real ones back in.
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../utils/firestore-utils.js', async () => {
  const actual = await vi.importActual<typeof import('../../utils/firestore-utils.js')>(
    '../../utils/firestore-utils.js'
  );
  return { ...actual, getFirestoreDb: vi.fn(actual.getFirestoreDb) };
});
// Production's store (Firestore on Cloud Run); outside production getStore() picks memory.
// A web hang-up makes the caller's user record there before saving the session.
vi.mock('../../memory/storage/store-factory.js', async () => {
  const { getFirestoreStore } = await import('../../memory/storage/firestore-store.js');
  return { getStore: async () => getFirestoreStore() };
});

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-history';

let server: Server;
let base: string;
const newUser = () => `u-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  if (!emulator) return;
  const { handleConversationsRoutes } = await import('../routes/conversations.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void handleConversationsRoutes(req, res, url.pathname, url).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());
afterEach(() => vi.clearAllMocks());

interface PanelSession {
  id: string;
  personaName: string;
  insights: string[];
  highlights: string[];
}

/** The panel's exact request: GET /api/conversations, no query. */
async function panelRead(uid: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${base}/api/conversations`, { headers: { 'x-firebase-uid': uid } });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/**
 * What session-manager.ts does for every call, phone or web: open it, persist each turn,
 * end it, summarize. Only a call where the user spoke is a session together.
 */
async function callLikeTheAgent(uid: string, summary: string, userSpeaks = true): Promise<string> {
  const realtime = await import('../../services/memory/realtime-memory.js');
  const id = await realtime.startConversation(uid, 'ferni');
  const said = (role: 'user' | 'assistant', content: string) =>
    realtime.persistTurn(uid, id, { role, content, timestamp: new Date() });
  await said('assistant', 'Hey, good to hear you.');
  if (userSpeaks) await said('user', 'Hi Ferni.');
  await realtime.endConversation(uid, id);
  await realtime.markSummarized(uid, id, summary);
  return id;
}

describe.skipIf(!emulator)("When We've Talked, call to panel (Firestore emulator)", () => {
  it('a phone call the agent records shows in the history', async () => {
    const uid = newUser();
    const id = await callLikeTheAgent(uid, 'Talked through the move to Denver');

    const { status, body } = await panelRead(uid);
    expect(status).toBe(200);
    expect(body.totalSessions).toBe(1);
    expect(body.sessions).toEqual([
      expect.objectContaining({
        id,
        personaId: 'ferni',
        personaName: 'Ferni',
        highlights: ['Talked through the move to Denver'],
      }),
    ]);
  });

  it('a call where only the greeting played is not listed or counted', async () => {
    const uid = newUser();
    await callLikeTheAgent(uid, 'Greeting only', false);

    const { status, body } = await panelRead(uid);
    expect(status).toBe(200);
    expect(body.totalSessions).toBe(0);
    expect(body.sessions).toEqual([]);
  });

  it("a web call shows once, with the web app's hang-up insights", async () => {
    const uid = newUser();
    const id = await callLikeTheAgent(uid, 'Sleep and the new job');
    // What POST /api/conversations stores when the web app hangs up
    const { getConversationHistoryService } =
      await import('../../services/stores/conversation-history.js');
    await getConversationHistoryService().recordSession(uid, {
      personaId: 'ferni',
      personaName: 'Ferni',
      duration: 12,
      messageCount: 20,
      insights: ['Mornings matter to you'],
      highlights: [],
      topicsDiscussed: ['Sleep'],
    });

    const sessions = (await panelRead(uid)).body.sessions as PanelSession[];
    expect(sessions.map((s) => [s.id, s.insights, s.highlights])).toEqual([
      [id, ['Mornings matter to you'], ['Sleep and the new job']],
    ]);
  });

  it('a store failure is an error, not an empty history', async () => {
    const uid = newUser();
    await callLikeTheAgent(uid, 'Anything');
    const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
    vi.mocked(getFirestoreDb).mockReturnValueOnce(null);

    const { status, body } = await panelRead(uid);
    expect(status).toBe(500);
    expect(body).not.toHaveProperty('sessions');
  });
});
