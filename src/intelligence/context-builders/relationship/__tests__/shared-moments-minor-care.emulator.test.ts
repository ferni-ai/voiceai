/**
 * Shared moments and MINOR_CARE on the Firestore emulator, with the real firebase-admin client:
 * the real writer's createdAt (an ISO string, from cleanForFirestore) and inside-joke-memory's
 * (epoch ms) are both found by the purge's range queries, the moments made in the held window are
 * deleted and older and later ones stay, and deep-relationship's read (a `type in [...]` query)
 * never hands a later call a held-window moment, even when the scrub never ran. Synthetic docs
 * only. Skips unless FIRESTORE_EMULATOR_HOST is set:
 *
 *   GCLOUD_PROJECT=demo-project firebase emulators:exec --only firestore:ferni-dev \
 *     --project demo-project "pnpm vitest run -c vitest.config.unit.ts <this file>"
 */
import type { Firestore } from 'firebase-admin/firestore';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { leakedPieces, SENTINEL } from '../../../../tests/helpers/snippet-leak.js';

vi.mock('firebase-admin/app', async () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', async () => vi.importActual('firebase-admin/firestore'));
// The vector store's own client isn't under test: its remove deletes the emulator's doc
vi.mock('../../../../memory/firestore-vector-store/index.js', async () => {
  const { getAdminFirestore } = await import('../../../../utils/firebase-admin-app.js');
  return {
    getFirestoreVectorStore: () => ({
      list: async () => [],
      cached: async () => ({ docs: [], fallback: false }),
      removeDocument: async (id: string) => (
        await getAdminFirestore().collection('vectors').doc(id).delete(),
        true
      ),
    }),
  };
});
// Memory Lane reads Firestore through this module (the shared setup fakes it): the emulator's
vi.mock('../../../../services/superhuman/firestore-utils.js', async () => {
  const real = await vi.importActual<typeof import('../../../../utils/firestore-utils.js')>(
    '../../../../utils/firestore-utils.js'
  );
  const { getAdminFirestore } = await import('../../../../utils/firebase-admin-app.js');
  return { ...real, getFirestoreDb: () => getAdminFirestore(), recordDegradation: () => undefined };
});
vi.mock('../../../../services/superhuman/semantic-intelligence/index.js', () => ({
  clearSemanticIntelligenceCache: () => undefined,
}));

const DAY = 24 * 60 * 60 * 1000;
const OLDER_WORDS = 'the heron at the lake that would not stop staring at us';

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('shared moments on the emulator', () => {
  let db: Firestore;
  let mods: {
    purge: typeof import('../../../../agents/voice-agent/minor-care-purge.js');
    deep: typeof import('../deep-relationship.js');
    mc: typeof import('../../../../utils/minor-care.js');
  };
  let n = 0;
  const uid = () => `ShMoEmu${++n}${Math.random().toString(36).slice(2, 8)}`;
  const moments = (u: string) => db.collection('bogle_users').doc(u).collection('shared_moments');
  const ids = async (u: string) => (await moments(u).get()).docs.map((d) => d.id).sort();
  const gag = (at: string, said: string, trigger: string) => ({
    type: 'running_gag',
    content: `the ${trigger} thing`,
    origin: { whatTheySaid: said },
    triggers: [trigger],
    callbackReception: 'positive',
    createdAt: at,
  });
  const laterCall = async (u: string) =>
    JSON.stringify(
      await mods.deep.buildDeepRelationshipContext({
        userText: 'ha, remember the quokka and the heron?',
        userData: { turnCount: 5 },
        services: { userId: u },
      } as never)
    );

  beforeAll(async () => {
    const { getAdminFirestore } = await import('../../../../utils/firebase-admin-app.js');
    db = getAdminFirestore();
    mods = {
      purge: await import('../../../../agents/voice-agent/minor-care-purge.js'),
      deep: await import('../deep-relationship.js'),
      mc: await import('../../../../utils/minor-care.js'),
    };
  });
  beforeEach(() => {
    vi.stubEnv('MINOR_CARE', 'on');
    mods.mc.resetMinorCare();
  });

  /** A call that began 1 s ago; an earlier call's moment; a moment stored before the age statement. */
  async function heldCall(u: string) {
    const s = `call-${u}`;
    const startedAt = Date.now() - 1000;
    mods.mc.bindSessionUser(s, u);
    await db.collection('bogle_users').doc(u).set({ totalConversations: 6 });
    await moments(u)
      .doc('a-held')
      .set(gag(new Date().toISOString(), SENTINEL, 'quokka'));
    await moments(u)
      .doc('b-older')
      .set(gag(new Date(Date.now() - 3 * DAY).toISOString(), OLDER_WORDS, 'heron'));
    return { s, startedAt };
  }

  it('the purge deletes the held-window moments of both writers; older and later ones stay', async () => {
    const u = uid();
    const call = await heldCall(u);
    await mods.deep.recordSharedMoment(u, {
      type: 'callback_moment',
      content: 'sad',
      whatTheySaid: SENTINEL,
      sessionId: call.s,
    });
    await moments(u)
      .doc('c-epoch')
      .set({ type: 'inside_joke', essence: SENTINEL, createdAt: Date.now() });
    await moments(u)
      .doc('d-later')
      .set(gag(new Date(Date.now() + 60_000).toISOString(), 'the owner, later', 'otter'));
    const written = (await moments(u).where('type', '==', 'callback_moment').get()).docs[0];
    expect(typeof written.get('createdAt')).toBe('string'); // what the range query must match
    expect(await ids(u)).toHaveLength(5);

    expect(mods.mc.heldAfter(call.s, "I'm 15.", { userId: u })).toBe(true);
    mods.purge.purgeHeldUser(u, call.s, call.startedAt);
    await vi.waitFor(async () => expect(await ids(u)).toEqual(['b-older', 'd-later']), {
      timeout: 5000,
    });
    const left = (await moments(u).get()).docs.map((d) => d.data());
    expect(leakedPieces(left)).toEqual([]);
  });

  it('a later call never reads a held-window moment back, even when the scrub never ran', async () => {
    const u = uid();
    const call = await heldCall(u);
    expect(await laterCall(u)).toContain('Dolores'); // the held moment is the first callback
    // The window is known (the purge's import set the check), as a purge whose scrub failed
    // leaves it: nothing was deleted
    const { noteHeldWindow } = await import('../../../../services/trust-systems/held-window.js');
    noteHeldWindow(u, call.startedAt);
    (await import('../shared-moments.js')).forgetReadMoments(u); // the purge's cache drop
    expect(await ids(u)).toEqual(['a-held', 'b-older']);
    const context = await laterCall(u);
    expect(leakedPieces(context)).toEqual([]);
    expect(context).toContain(OLDER_WORDS);
  });

  it('the index purge pages through every entry: 650, the held ones past the first 500', async () => {
    const u = uid();
    const since = Date.now() - 1000;
    const { noteHeldWindow, recordedWhileHeld } =
      await import('../../../../services/trust-systems/held-window.js');
    noteHeldWindow(u, since);
    const batch = db.batch();
    for (let i = 0; i < 650; i++) {
      const at = new Date(i >= 600 ? since + 10 : since - DAY).toISOString();
      batch.set(db.collection('vectors').doc(`pg-${u}-${String(i).padStart(4, '0')}`), {
        text: i >= 600 ? SENTINEL : 'older',
        metadata: {
          userId: u,
          source: 'store_auto_sync',
          entityType: 'inside_joke',
          indexedAt: at,
        },
      });
    }
    await batch.commit();
    const { purgeHeldIndexEntries } =
      await import('../../../../services/data-layer/held-index-purge.js');
    expect(await purgeHeldIndexEntries(u, (t) => recordedWhileHeld(u, t))).toBe(50);
    const left = await db.collection('vectors').where('metadata.userId', '==', u).get();
    expect(left.size).toBe(600);
    expect(leakedPieces(left.docs.map((d) => d.data()))).toEqual([]);
  });

  it('the purge deletes Memory Lane captures from the held window; older ones stay', async () => {
    const u = uid();
    const call = await heldCall(u);
    const lane = db.collection('bogle_users').doc(u).collection('memory_highlights');
    const capture = (at: number, content: string) => ({
      content,
      sourceType: 'inside_joke',
      occurredAt: new Date(at - 10 * DAY).toISOString(), // the event: never the key
      createdAt: new Date(at).toISOString(), // when it was written
    });
    await lane.doc('held').set(capture(Date.now() - 300, SENTINEL));
    await lane.doc('older').set(capture(Date.now() - 30 * DAY, OLDER_WORDS));
    expect(mods.mc.heldAfter(call.s, "I'm 15.", { userId: u })).toBe(true);
    mods.purge.purgeHeldUser(u, call.s, call.startedAt);
    await vi.waitFor(
      async () => expect((await lane.get()).docs.map((d) => d.id)).toEqual(['older']),
      {
        timeout: 5000,
      }
    );
  });

  it('collectAllMemories in the window about a 10-day-old milestone: scrubbed, not read back', async () => {
    const u = uid();
    const call = await heldCall(u);
    await db
      .doc(`bogle_users/${u}/relationship_milestones/ms1`)
      .set({
        userId: u,
        type: 'first_month',
        title: 'One month',
        description: SENTINEL,
        achievedAt: Date.now() - 10 * DAY,
      });
    const lane = await import('../../../../services/memory-lane/memory-collector.js');
    await lane.collectAllMemories(u);
    const highlights = db.collection('bogle_users').doc(u).collection('memory_highlights');
    const written = (await highlights.get()).docs.map((d) => d.data());
    expect(written).toHaveLength(1);
    expect(Date.parse(String(written[0]!.occurredAt))).toBeLessThan(call.startedAt);
    expect(typeof written[0]!.createdAt).toBe('string'); // what the scrub's range query matches
    expect(mods.mc.heldAfter(call.s, "I'm 15.", { userId: u })).toBe(true);
    mods.purge.purgeHeldUser(u, call.s, call.startedAt);
    await vi.waitFor(async () => expect((await highlights.get()).size).toBe(0), { timeout: 5000 });
    mods.mc.resetMinorCare();
    expect(await lane.loadMemories(u)).toEqual([]);
  });

  it('a store in fallback mode: -1, and recovery migrates no held entry back', async () => {
    const u = uid();
    const since = Date.now() - 1000;
    const { noteHeldWindow, recordedWhileHeld } =
      await import('../../../../services/trust-systems/held-window.js');
    noteHeldWindow(u, since);
    const { FirestoreVectorStore } =
      await import('../../../../memory/firestore-vector-store/core.js');
    const { migrateCacheToFirestore } =
      await import('../../../../memory/firestore-vector-store/recovery.js');
    const store = new FirestoreVectorStore();
    await store.initialize();
    const raw = store as unknown as { useFallback: boolean; fallbackCache: never };
    raw.useFallback = true; // as a failed connectivity check leaves it
    const metadata = { userId: u, source: 'store_auto_sync', entityType: 'inside_joke' };
    const add = (id: string, at: number) =>
      store.addDocument({
        id,
        text: SENTINEL,
        embedding: new Array(768).fill(0.02),
        metadata: { ...metadata, indexedAt: new Date(at).toISOString() },
      });
    await add(`fb-held-${u}`, since + 10); // indexed before the age statement, in the cache only
    await add(`fb-old-${u}`, since - DAY);
    const { purgeHeldIndexEntries } =
      await import('../../../../services/data-layer/held-index-purge.js');
    expect(await purgeHeldIndexEntries(u, (t) => recordedWhileHeld(u, t), store)).toBe(-1);
    expect((await store.list({ userId: u })).map((d) => d.id)).toEqual([`fb-old-${u}`]);
    raw.useFallback = false; // recovery
    await migrateCacheToFirestore(db as never, 'vectors', raw.fallbackCache);
    const ids = (await db.collection('vectors').where('metadata.userId', '==', u).get()).docs.map(
      (d) => d.id
    );
    expect(ids).toEqual([`fb-old-${u}`]);
  });
});
