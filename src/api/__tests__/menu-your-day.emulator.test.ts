/**
 * "Your Day" (menu item 1), call → panel: a commitment the voice tool saves
 * comes back through GET /api/commitments with the query the hub sends
 * (apps/web/src/ui/ferni-hub-data.ts). Real handler on a node:http server, real
 * Firestore emulator. The hub used to ask for status=pending, which the keeper
 * never stores, and the UI server cached a user's list for its whole lifetime.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Firestore } from 'firebase-admin/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// src/tests/setup.ts fakes firebase-admin and getFirestoreDb for every test; the keeper
// and the route read through them, so this file swaps the real ones back in.
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../utils/firestore-utils.js', () => vi.importActual('../../utils/firestore-utils.js'));
vi.mock('../../services/superhuman/firestore-utils.js', () =>
  vi.importActual('../../utils/firestore-utils.js')
);

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-your-day';

let server: Server;
let base: string;
let db: Firestore;
const newUser = () => `u-${Math.random().toString(36).slice(2)}`;

/** The hub's exact query (ferni-hub-data.ts readRoutes). */
const HUB_QUERY = 'status=active&limit=8';

beforeAll(async () => {
  if (!emulator) return;
  const { handleCommitmentsRoutes } = await import('../routes/commitments.js');
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void handleCommitmentsRoutes(req, res, url.pathname, url).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const { getAdminFirestore } = await import('../../utils/firebase-admin-app.js');
  db = getAdminFirestore();
});

afterAll(() => server?.close());
afterEach(() => vi.restoreAllMocks());

async function hubRead(uid: string): Promise<{ status: number; descriptions: string[] }> {
  const res = await fetch(`${base}/api/commitments?userId=${uid}&${HUB_QUERY}`, {
    headers: { 'x-firebase-uid': uid },
  });
  const body = (await res.json()) as { items?: Array<{ description: string }> };
  return { status: res.status, descriptions: (body.items ?? []).map((i) => i.description) };
}

/** What tools/domains/productivity/commitments.ts sends saveCommitment. */
async function saveLikeTheVoiceTool(userId: string, summary: string): Promise<void> {
  const { saveCommitment } = await import('../../services/superhuman/commitment-keeper.js');
  const now = Date.now();
  await saveCommitment({
    userId,
    statement: `I'm going to ${summary}`,
    summary,
    text: summary,
    type: 'intention',
    emotionalWeight: 0.5,
    targetDate: undefined,
    createdAt: now,
    lastMentioned: now,
    followUpAfter: now + 3 * 24 * 60 * 60 * 1000,
    status: 'active',
    followUpCount: 0,
  });
}

describe.skipIf(!emulator)('Your Day commitments, call to panel (Firestore emulator)', () => {
  it('a commitment the voice tool saves comes back through the hub query', async () => {
    const uid = newUser();
    await saveLikeTheVoiceTool(uid, 'call my sister about the move');

    expect(await hubRead(uid)).toEqual({
      status: 200,
      descriptions: ['call my sister about the move'],
    });
  });

  it('saving into a cold cache keeps the commitments already stored', async () => {
    const uid = newUser();
    // Stored by an earlier call, before this process read anything for the user
    await db
      .collection('bogle_users')
      .doc(uid)
      .collection('commitments')
      .doc('commit_old')
      .set({
        id: 'commit_old',
        userId: uid,
        statement: 'I want to run on Sundays',
        summary: 'run on Sundays',
        text: 'run on Sundays',
        type: 'intention',
        status: 'active',
        createdAt: Date.now() - 86_400_000,
        lastMentioned: Date.now() - 86_400_000,
        followUpAfter: Date.now(),
        emotionalWeight: 0.5,
        followUpCount: 0,
      });
    await saveLikeTheVoiceTool(uid, 'book the dentist');

    expect((await hubRead(uid)).descriptions).toEqual(['book the dentist', 'run on Sundays']);
  });

  it("a commitment the agent's process saves shows once this process's cache expires", async () => {
    const { COMMITMENT_CACHE_TTL_MS } =
      await import('../../services/superhuman/commitment-store.js');
    const uid = newUser();
    expect((await hubRead(uid)).descriptions).toEqual([]); // the UI server caches []

    // The agent runs in another process, so its save never touches this cache
    const now = Date.now();
    await db.collection('bogle_users').doc(uid).collection('commitments').doc('commit_agent').set({
      id: 'commit_agent',
      userId: uid,
      statement: 'I will email Sam',
      summary: 'email Sam',
      text: 'email Sam',
      type: 'promise',
      status: 'active',
      createdAt: now,
      lastMentioned: now,
      followUpAfter: now,
      emotionalWeight: 0.5,
      followUpCount: 0,
    });
    expect((await hubRead(uid)).descriptions).toEqual([]);

    vi.spyOn(Date, 'now').mockReturnValue(now + COMMITMENT_CACHE_TTL_MS + 1);
    expect((await hubRead(uid)).descriptions).toEqual(['email Sam']);
  });
});
