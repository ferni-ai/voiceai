/**
 * "This Year Together", call → panel: the summary a call saves at session end
 * (end-session.ts → store.saveSummary, bogle_users/{uid}/summaries) comes back through
 * GET /api/year-in-review/:uid, the route the panel calls
 * (apps/web/src/ui/your-year-with-ferni.ui.ts). The route read conversation_summaries,
 * which nothing on the live path writes, so every year showed zero conversations.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// src/tests/setup.ts fakes firebase-admin and getFirestoreDb for every test; the writer
// and the route read through them, so this file swaps the real ones back in.
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../utils/firestore-utils.js', () => vi.importActual('../../utils/firestore-utils.js'));
vi.mock('../../services/superhuman/firestore-utils.js', () =>
  vi.importActual('../../utils/firestore-utils.js')
);
// The caller is the user named in the URL (auth is covered by year-in-review-auth.test.ts)
vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: { headers: Record<string, string> }) => ({
    userId: req.headers['x-test-uid'],
    isAdmin: false,
  })),
}));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-year';

let server: Server;
let base: string;
const newUser = () => `u-${Math.random().toString(36).slice(2)}`;

beforeAll(async () => {
  if (!emulator) return;
  const { handleYearInReviewRoutes } = await import('../year-in-review-routes.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void handleYearInReviewRoutes(req, res, { pathname: url.pathname, query: {} }).then(
      (handled) => {
        if (!handled) res.writeHead(404).end();
      }
    );
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

/** What end-session.ts saves for a finished call. */
async function saveLikeACall(uid: string, daysAgo: number, topics: string[]): Promise<void> {
  const { getFirestoreStore } = await import('../../memory/storage/firestore-store.js');
  const id = `summary-${Math.random().toString(36).slice(2)}`;
  await getFirestoreStore().saveSummary(uid, {
    id,
    sessionId: id,
    timestamp: new Date(Date.now() - daysAgo * 86_400_000),
    duration: 600,
    turnCount: 12,
    mainTopics: topics,
    keyPoints: ['Talked it through'],
    emotionalArc: 'started worried, ended calmer',
  });
}

async function panelRead(uid: string): Promise<{ status: number; body: Record<string, any> }> {
  const res = await fetch(`${base}/api/year-in-review/${uid}`, {
    headers: { 'x-test-uid': uid },
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

describe.skipIf(!emulator)('This Year Together, call to panel (Firestore emulator)', () => {
  it("the calls a user had this year show in the year's stats and topics", async () => {
    const uid = newUser();
    await saveLikeACall(uid, 20, ['the move']);
    await saveLikeACall(uid, 3, ['the move', 'sleep']);
    await saveLikeACall(uid, 400, ['last year']); // older than a year: left out

    const { status, body } = await panelRead(uid);
    expect(status).toBe(200);
    expect(body.stats.totalConversations).toBe(2);
    expect(body.stats.totalMinutes).toBe(20);
    expect(body.topTopics.map((t: { topic: string; count: number }) => [t.topic, t.count])).toEqual(
      [
        ['the move', 2],
        ['sleep', 1],
      ]
    );
    expect(body.conversationCounts).toHaveLength(2);
  });
});
