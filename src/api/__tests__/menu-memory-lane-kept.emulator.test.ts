/**
 * "Memory Lane", kept commitments: a commitment shows as kept only once it is
 * completed, read from the commitment store through its own filters, and comes
 * back through GET /api/memories/highlights, the panel's first tab
 * (memory-lane.ui.ts loadTabData). Real route on node:http, real firebase-admin
 * on the Firestore emulator; the route is loaded after vi.resetModules, like the
 * separate API process.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// src/tests/setup.ts fakes firebase-admin and getFirestoreDb for every test; the writers
// and the route read through them, so this file swaps the real ones back in.
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../utils/firestore-utils.js', () => vi.importActual('../../utils/firestore-utils.js'));
vi.mock('../../services/superhuman/firestore-utils.js', () =>
  vi.importActual('../../utils/firestore-utils.js')
);

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-memory-lane-kept';

const newUser = () => `u-${Math.random().toString(36).slice(2)}`;
const PROMISE = 'call my sister on her birthday';
const KEPT = `You kept your promise: "${PROMISE}"`;
const [userKept, userForgot, userLate, userReleased] = [newUser(), newUser(), newUser(), newUser()];
const ids: Record<string, string> = {};

let server: Server;
let base: string;

const keeper = () => import('../../services/superhuman/commitment-keeper.js');

/** The agent saves what the caller committed to, as it does mid-call. */
async function agentSavesCommitment(userId: string): Promise<string> {
  const now = Date.now();
  const { commitment, notActionable } = await (
    await keeper()
  ).saveCommitment(
    {
      userId,
      statement: `I'm going to ${PROMISE} this Saturday`,
      summary: PROMISE,
      text: PROMISE,
      type: 'intention',
      emotionalWeight: 0.7,
      createdAt: now,
      lastMentioned: now,
      followUpAfter: now + 3 * 24 * 60 * 60 * 1000,
      status: 'active',
      followUpCount: 0,
    },
    { validateCalendar: false, createCalendarBlocks: false }
  );
  expect(notActionable).toBeUndefined();
  return commitment.id;
}

/** The real completion path: the commitment tools and PATCH /api/commitments/:id. */
const markDone = async (userId: string) =>
  (await keeper()).updateCommitmentStatus(userId, ids[userId], 'completed');

const forgetSister = async (userId: string) =>
  (await import('../../memory/recall/forget.js')).forgetTopic(userId, 'sister');

beforeAll(async () => {
  if (!emulator) return;
  for (const u of [userKept, userForgot, userLate, userReleased])
    ids[u] = await agentSavesCommitment(u);
  // The copy main used to save when a commitment was made: labelled kept and proud.
  const { processCollectionInput } = await import('../../services/memory-lane/memory-collector.js');
  await processCollectionInput({
    userId: userKept,
    sourceType: 'commitment_kept',
    sourceId: ids[userKept],
    rawContent: PROMISE,
    occurredAt: new Date(),
  });
  await markDone(userForgot);
  await forgetSister(userForgot);
  await markDone(userLate);
  await markDone(userReleased);
  vi.resetModules(); // the API server is another process
  const { handleMemoriesRoutes } = await import('../routes/memories.js');
  server = createServer((req: IncomingMessage, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void handleMemoriesRoutes(req, res, url.pathname, url).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

/** The panel's GET, as the verified caller (servers/api/request-identity.ts). */
async function contents(uid: string, query = ''): Promise<string[]> {
  const res = await fetch(`${base}/api/memories/highlights${query}`, {
    headers: { 'x-firebase-uid': uid },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { memories: Array<{ content: string }> };
  return body.memories.map((m) => m.content);
}

const aboutIt = (all: string[]) => all.filter((c) => c.includes(PROMISE));

const collector = () => import('../../services/memory-lane/memory-collector.js');

/** What loadMemories returns: the read behind Highlights, On This Day and Timeline. */
const stored = async (uid: string) =>
  (await (await collector()).loadMemories(uid)).map((m) => m.content);

describe.skipIf(!emulator)('Memory Lane, kept commitments (Firestore emulator)', () => {
  it('a commitment made but not kept is not shown as kept, old copies included', async () => {
    expect(aboutIt(await contents(userKept))).toEqual([]);
  });

  it('once completed through the real path, it shows as kept, once', async () => {
    await markDone(userKept);
    expect(aboutIt(await contents(userKept))).toEqual([KEPT]);
    expect(aboutIt(await contents(userKept))).toEqual([KEPT]); // a second visit adds none
  });

  it('a forgotten commitment never appears, forgotten before or after it showed', async () => {
    expect(aboutIt(await contents(userForgot))).toEqual([]);
    expect(aboutIt(await contents(userLate))).toEqual([KEPT]);
    await forgetSister(userLate);
    expect(aboutIt(await contents(userLate))).toEqual([]);
    expect(aboutIt(await stored(userLate))).toEqual([]);
    expect(aboutIt(await stored(userForgot))).toEqual([]);
  });

  it('a kept commitment later released (dismissed) drops out of loadMemories', async () => {
    expect(aboutIt(await contents(userReleased))).toEqual([KEPT]);
    await (await keeper()).updateCommitmentStatus(userReleased, ids[userReleased], 'dismissed');
    expect(aboutIt(await stored(userReleased))).toEqual([]);
    expect(aboutIt(await contents(userReleased))).toEqual([]);
  });

  it('another user never sees it, even asking for it by ?userId', async () => {
    expect(aboutIt(await contents(userKept))).toEqual([KEPT]); // there is one to leak
    const userB = newUser();
    expect(aboutIt(await contents(userB))).toEqual([]);
    expect(aboutIt(await contents(userB, `?userId=${userKept}`))).toEqual([]);
  });

  it('with the commitment store unreadable, kept memories fail closed and others still show', async () => {
    const DREAM = 'run the Chicago marathon';
    await (
      await collector()
    ).processCollectionInput({
      userId: userKept,
      sourceType: 'dream_progress',
      sourceId: 'dream-1',
      rawContent: DREAM,
      occurredAt: new Date(),
    });
    expect(await stored(userKept)).toEqual(expect.arrayContaining([KEPT, DREAM]));
    vi.resetModules();
    vi.doMock('../../services/superhuman/commitment-store.js', async (importOriginal) => ({
      ...(await importOriginal<object>()),
      loadCompletedCommitmentsOrThrow: () => Promise.reject(new Error('store unreadable')),
    }));
    try {
      const all = await stored(userKept);
      expect(all).toContain(DREAM);
      expect(aboutIt(all)).toEqual([]);
    } finally {
      vi.doUnmock('../../services/superhuman/commitment-store.js');
      vi.resetModules();
    }
  });
});
