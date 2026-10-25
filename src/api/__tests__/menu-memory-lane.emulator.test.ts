/**
 * "Memory Lane", call → panel: a commitment the agent saves during a call
 * (saveCommitment, the one writer behind per-turn commitment detection and the
 * commitment tools) is captured as a memory and comes back through
 * GET /api/memories/highlights, the panel's first tab (memory-lane.ui.ts
 * loadTabData). Real route on node:http, real firebase-admin on the Firestore
 * emulator. The route is loaded after vi.resetModules, so nothing is shared
 * with the writer through module state, like the separate API process.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
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

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-memory-lane';

const newUser = () => `u-${Math.random().toString(36).slice(2)}`;
const userA = newUser();
const PROMISE = 'call my sister on her birthday';

let server: Server;
let base: string;

/** The agent saves what the caller committed to, as it does mid-call. */
async function agentSavesCommitment(userId: string): Promise<string> {
  const { saveCommitment } = await import('../../services/superhuman/commitment-keeper.js');
  const now = Date.now();
  const { commitment, notActionable } = await saveCommitment(
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

beforeAll(async () => {
  if (!emulator) return;
  await agentSavesCommitment(userA);
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

interface Highlights {
  memories: Array<{ content: string; type: string }>;
}

/**
 * The panel's GET. x-firebase-uid is the identity the API door binds from a
 * verified token (servers/api/request-identity.ts) and the route reads.
 */
async function highlights(uid: string, query = ''): Promise<Highlights> {
  const res = await fetch(`${base}/api/memories/highlights${query}`, {
    headers: { 'x-firebase-uid': uid },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as Highlights;
}

const contents = (h: Highlights) => h.memories.map((m) => m.content);

describe.skipIf(!emulator)('Memory Lane, call to panel (Firestore emulator)', () => {
  it('a commitment from a call shows up in Highlights', async () => {
    // The capture runs after saveCommitment returns, so give it a moment to land.
    await expect
      .poll(async () => contents(await highlights(userA)), { timeout: 10_000 })
      .toEqual(expect.arrayContaining([expect.stringContaining(PROMISE)]));
  });

  it('another user never sees it, even asking for it by ?userId', async () => {
    await expect.poll(async () => contents(await highlights(userA))).not.toHaveLength(0);
    const userB = newUser();
    expect(contents(await highlights(userB))).toEqual([]);
    expect(contents(await highlights(userB, `?userId=${userA}`))).toEqual([]);
  });

  it('with no verified identity the route refuses instead of guessing a user', async () => {
    const res = await fetch(`${base}/api/memories/highlights?userId=${userA}`);
    expect(res.status).toBe(401);
  });
});
