/**
 * MINOR_CARE in an API process (no purge module), on the Firestore emulator with the real
 * firebase-admin client: the #2906 verifier's point 5 interleaving. The API reads a user's windows
 * (none); another process then stores a held window and its scrub fails; the API's next read, well
 * inside the minute the windows used to be cached for, must serve nothing held. Synthetic only.
 * Skips unless FIRESTORE_EMULATOR_HOST is set:
 *
 *   GCLOUD_PROJECT=demo-project firebase emulators:exec --only firestore:ferni-dev \
 *     --project demo-project "pnpm vitest run -c vitest.config.unit.ts <this file>"
 */
import type { Firestore } from 'firebase-admin/firestore';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { leakedPieces, SENTINEL } from '../../../tests/helpers/snippet-leak.js';

vi.mock('firebase-admin/app', async () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', async () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../superhuman/firestore-utils.js', async () => {
  const real = await vi.importActual<typeof import('../../../utils/firestore-utils.js')>(
    '../../../utils/firestore-utils.js'
  );
  const { getAdminFirestore } = await import('../../../utils/firebase-admin-app.js');
  return { ...real, getFirestoreDb: () => getAdminFirestore(), recordDegradation: () => undefined };
});
vi.mock('../../trust-systems/trust-doc.js', async (orig) => {
  const real = await orig<typeof import('../../trust-systems/trust-doc.js')>();
  const { getAdminFirestore } = await import('../../../utils/firebase-admin-app.js');
  return { ...real, getTrustDb: () => getAdminFirestore() };
});
// An API process: importing the purge fails the test
vi.mock('../../../agents/voice-agent/minor-care-purge.js', () => {
  throw new Error('the purge module was loaded');
});

const DAY = 24 * 60 * 60 * 1000;

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('held windows in an API process', () => {
  let db: Firestore;
  let hw: typeof import('../../trust-systems/held-window.js');
  let lane: typeof import('../memory-collector.js');
  let jokes: typeof import('../../superhuman/inside-joke-memory.js');
  let n = 0;
  const uid = () => `HwApiEmu${++n}${Math.random().toString(36).slice(2, 8)}`;
  const coll = (u: string, c: string) => db.collection('bogle_users').doc(u).collection(c);
  const capture = (u: string, id: string, writtenMs: number, content: string) =>
    coll(u, 'memory_highlights').doc(id).set({
      id,
      userId: u,
      content,
      type: 'milestone',
      sourceType: 'milestone_reached',
      occurredAt: new Date(writtenMs - 10 * DAY).toISOString(),
      createdAt: new Date(writtenMs).toISOString(),
      updatedAt: new Date(writtenMs).toISOString(),
    });
  const joke = (u: string, id: string, at: number, essence: string) =>
    coll(u, 'shared_moments').doc(id).set({ type: 'inside_joke', essence, resonance: 0.9, createdAt: at });

  beforeAll(async () => {
    db = (await import('../../../utils/firebase-admin-app.js')).getAdminFirestore();
    hw = await import('../../trust-systems/held-window.js');
    lane = await import('../memory-collector.js');
    jokes = await import('../../superhuman/inside-joke-memory.js');
  });
  beforeEach(() => vi.stubEnv('MINOR_CARE', 'on'));

  it('read none, then a window stored elsewhere with a failed scrub: the next read serves nothing held', async () => {
    const u = uid();
    const t0 = Date.now();
    expect(await lane.loadMemories(u)).toEqual([]); // the API read the user's windows: none
    expect(await jokes.loadSharedMoments(u)).toEqual([]);
    await capture(u, 'held', t0 - 1000, SENTINEL); // the voice process, during the held call
    await joke(u, 'j-held', t0 - 1000, SENTINEL);
    expect(await hw.storeHeldWindow(u, [t0 - 2000, Date.now()])).toBe(true); // its purge; no scrub
    const memories = await lane.loadMemories(u);
    const moments = await jokes.loadSharedMoments(u);
    expect(Date.now() - t0).toBeLessThan(60_000);
    expect(leakedPieces(memories)).toEqual([]);
    expect(leakedPieces(moments)).toEqual([]);
  });

  it('adults: a user with no window gets every capture and moment', async () => {
    const u = uid();
    await capture(u, 'recent', Date.now() - 5000, 'we finally fixed the porch light together');
    await joke(u, 'j-recent', Date.now() - 5000, 'the porch light that only works upside down');
    expect((await lane.loadMemories(u)).map((m) => m.id)).toEqual(['recent']);
    expect((await jokes.loadSharedMoments(u)).map((m) => m.id)).toEqual(['j-recent']);
  });
});
