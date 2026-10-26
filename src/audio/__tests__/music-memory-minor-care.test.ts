/**
 * Music memory never keeps the caller's words, and respects MINOR_CARE.
 *
 * Before: storeMusicHelpedMemory kept `evidence.userResponse` (what the caller said after the
 * music) in bogle_users/{uid}/music_learning/memories, written by the store's 15 s timer. A held
 * caller under 18's memories were still made in memory, a session-level hold (not yet bound to the
 * user) was written, and the purge left what the timer had already stored, so the next call (in
 * any process) loaded it back. Old docs with the words loaded and were saved back with them.
 *
 * Real modules and the real purge; only Firestore is faked. A "process" is a fresh module
 * registry. Synthetic uids and words only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeEngagementFirestore,
  type FakeEngagementFirestore,
} from '../../services/engagement/__tests__/fake-engagement-firestore.js';
import { leakedPieces, SENTINEL } from '../../tests/helpers/snippet-leak.js';
import type { MusicPreference } from '../music-memory-integration.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'now' } }));
vi.mock('../../utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => fake.db }));
vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));
vi.mock('../../services/superhuman/semantic-intelligence/index.js', () => ({
  clearSemanticIntelligenceCache: () => undefined,
}));

type Ref = { get: () => Promise<unknown>; set: (d: unknown, o?: unknown) => Promise<void> };
let firestore: FakeEngagementFirestore;
const batch = () => {
  const ops: Array<() => Promise<void>> = [];
  return {
    set: (ref: Ref, d: unknown, o: unknown) => void ops.push(() => ref.set(d, o)),
    commit: async () => void (await Promise.all(ops.map((op) => op()))),
  };
};
/** The purge's scrub fails for these users, as an unavailable Firestore would. */
const failTransactions = new Set<string>();
const runTransaction = async (fn: (tx: unknown) => Promise<unknown>) => {
  const ops: Array<() => Promise<void>> = [];
  const out = await fn({
    get: async (ref: Ref) => {
      const snap = (await ref.get()) as { data: () => { userId?: string } | undefined };
      const id = snap.data()?.userId;
      if (id && failTransactions.has(id)) throw new Error('14 UNAVAILABLE: fake outage');
      return snap;
    },
    set: (ref: Ref, d: unknown, o?: unknown) => void ops.push(() => ref.set(d, o)),
  });
  for (const op of ops) await op();
  return out;
};

let n = 0;
const uid = (tag: string) => `MuMc${tag}${String(++n).padStart(3, '0')}xQ7mN2pLk9Vb4Hc`;
const memoriesPath = (u: string) => `bogle_users/${u}/music_learning/memories`;
/** Every music_learning doc stored for this user. */
const musicDocs = (u: string) =>
  [...firestore.docs].filter(([p]) => p.startsWith(`bogle_users/${u}/music_learning/`));
const storedMemories = (u: string) =>
  ((firestore.docs.get(memoriesPath(u)) as { memories?: Array<{ tags: string[] }> } | undefined)
    ?.memories ?? []) as Array<{ tags: string[]; evidence: Record<string, unknown> }>;

async function proc() {
  vi.resetModules();
  const [persist, mm, mt, mc, purge, an] = await Promise.all([
    import('../music-learning-persistence.js'),
    import('../music-memory-integration.js'),
    import('../intelligent-music-transitions.js'),
    import('../../utils/minor-care.js'),
    import('../../agents/voice-agent/minor-care-purge.js'),
    import('../music-transition-analytics.js'),
  ]);
  // The persistence layer opens Firestore on its first read; two reads at once (profile and
  // memories) see it unopened, so one read opens it first, as an earlier store does in a call.
  await persist.ensureProfileLoaded('MuMcWarmUp000xQ7mN2pLk9Vb4Hc');
  return { persist, mm, mt, mc, purge, an };
}
type P = Awaited<ReturnType<typeof proc>>;

/** A tagged music context, so each memory can be told apart in the stored doc. */
const ctx = (tag: string) =>
  ({ startReason: tag, trackName: 'synthetic track', wasAmbient: true }) as never;
/** The caller speaks after the music: positive, and carrying the sentinel sentence. */
const SAID = `That helped, thank you. ${SENTINEL}`;
function feedback(p: P, u: string, tag: string, sessionId?: string) {
  p.mt.recordTransitionFeedback(
    `evt-${tag}`,
    u,
    'presence' as never,
    { wasPositive: true, confidence: 0.9, userResponse: SAID, continuedSession: true },
    { musicContext: ctx(tag), sessionId }
  );
}
const tagsOf = (u: string) => storedMemories(u).flatMap((m) => m.tags);
/** The emotional states the stored preferences cover. */
const prefStates = (u: string) =>
  (
    (firestore.docs.get(memoriesPath(u)) as { preferences?: MusicPreference[] } | undefined)
      ?.preferences ?? []
  ).map((pref) => pref.context.emotionalState);

beforeEach(() => {
  firestore = createFakeEngagementFirestore();
  fake.db = { ...firestore.db, batch, runTransaction };
  vi.stubEnv('MINOR_CARE', 'on');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('music memory keeps no words', () => {
  it('(a) a caller who says a sentence: no 10+ character piece of it is stored', async () => {
    const p = await proc();
    const u = uid('A');
    await p.persist.ensureMusicLearningLoaded(u);
    feedback(p, u, 'comfort');
    await p.persist.flushMusicLearning(u);
    expect(storedMemories(u)).toHaveLength(1); // precondition: the memory was stored
    expect(storedMemories(u)[0].evidence.explicitPositive).toBe(true); // the label survives
    expect(leakedPieces(musicDocs(u))).toEqual([]);
    expect(leakedPieces(p.mm.exportUserMusicMemories(u))).toEqual([]);
    expect(leakedPieces(p.an.getTransitionAnalytics().export())).toEqual([]); // engagement log
  });

  it('(a) words that reach a memory in memory are never saved', async () => {
    const p = await proc();
    const u = uid('M');
    await p.persist.ensureMusicLearningLoaded(u);
    const m = p.mm.storeMusicHelpedMemory(u, ctx('comfort'), 'presence' as never, {
      userResponse: SAID,
    })!;
    const evidence = { ...m.evidence, userResponse: SENTINEL } as typeof m.evidence;
    p.mm.importUserMusicMemories(u, { memories: [{ ...m, evidence }], preferences: [] });
    await p.persist.flushMusicLearning(u);
    expect(storedMemories(u)).toHaveLength(1);
    expect(leakedPieces(musicDocs(u))).toEqual([]);
  });

  it('(d) an old doc with the words loads without them and is saved back without them', async () => {
    const u = uid('D');
    const old = {
      id: 'm-old',
      createdAt: '2026-09-01T10:00:00.000Z',
      emotionalContext: { state: 'stressed', intensity: 0.8 },
      music: { trackName: 'synthetic track', wasAmbient: true },
      evidence: { userResponse: SENTINEL, continuedSession: true, explicitPositive: true },
      effectiveTransition: 'presence',
      confidence: 0.8,
      tags: ['comfort'],
    };
    firestore.docs.set(memoriesPath(u), {
      userId: u,
      updatedAt: old.createdAt,
      memories: [old],
      preferences: [],
    });
    const p = await proc();
    await p.persist.ensureMusicLearningLoaded(u);
    const loaded = p.mm.exportUserMusicMemories(u).memories;
    expect(loaded.map((m) => m.id)).toEqual(['m-old']);
    expect(leakedPieces(loaded)).toEqual([]);
    expect(loaded[0].evidence).toMatchObject({ explicitPositive: true, continuedSession: true });
    await p.persist.flushAllMusicLearning(); // only what the load queued: it saves the doc back
    expect(storedMemories(u).map((m) => (m as unknown as { id: string }).id)).toEqual(['m-old']);
    expect(leakedPieces(musicDocs(u))).toEqual([]);
  });
});

describe('music memory and MINOR_CARE', () => {
  it('(b) a held session (not yet bound to the user) makes and writes nothing', async () => {
    const p = await proc();
    const u = uid('B');
    await p.persist.ensureMusicLearningLoaded(u);
    const s = `held-${u}`;
    expect(p.mc.heldAfter(s, "I'm 15.")).toBe(true);
    feedback(p, u, 'comfort', s);
    const direct = p.mm.storeMusicHelpedMemory(
      u,
      ctx('direct'),
      'presence' as never,
      {
        userResponse: SAID,
      },
      s
    );
    expect(direct).toBeNull();
    await p.persist.flushMusicLearning(u);
    expect(p.mm.exportUserMusicMemories(u).memories).toEqual([]);
    expect(musicDocs(u)).toEqual([]);
  });

  it('(b) a held caller bound to the user: no memory in memory or storage', async () => {
    const p = await proc();
    const u = uid('H');
    await p.persist.ensureMusicLearningLoaded(u);
    const s = `held-${u}`;
    expect(p.mc.heldAfter(s, "I'm 15.", { userId: u })).toBe(true);
    feedback(p, u, 'comfort', s);
    feedback(p, u, 'thinking'); // no session given: the user is held
    expect(p.mm.exportUserMusicMemories(u).memories).toEqual([]);
    await p.persist.flushMusicLearning(u);
    expect(musicDocs(u)).toEqual([]);
  });

  it('(c) the purge removes memories made in the held window; a new process loads none', async () => {
    const u = uid('C');
    const seed = await proc(); // an earlier, ordinary call
    await seed.persist.ensureMusicLearningLoaded(u);
    feedback(seed, u, 'celebration');
    await seed.persist.flushMusicLearning(u);
    await seed.persist.shutdownMusicLearningPersistence();
    await new Promise((r) => {
      setTimeout(r, 5);
    });

    const a = await proc(); // the held call
    const s1 = `held-${u}`;
    const startedAt = Date.now();
    a.mc.bindSessionUser(s1, u);
    await a.persist.ensureMusicLearningLoaded(u);
    feedback(a, u, 'comfort', s1); // before the age statement
    await a.persist.flushMusicLearning(u); // what the 15 s timer does
    expect(tagsOf(u)).toEqual(expect.arrayContaining(['celebration', 'comfort'])); // precondition
    expect(prefStates(u).sort()).toEqual(['celebrating', 'stressed']);
    expect(a.mc.heldAfter(s1, "I'm 15.", { userId: u })).toBe(true);
    a.purge.purgeHeldUser(u, s1, startedAt);
    await vi.waitFor(() => expect(tagsOf(u)).not.toContain('comfort'), { timeout: 2000 });
    expect(tagsOf(u)).toContain('celebration'); // older history kept
    expect(prefStates(u)).toEqual(['celebrating']); // rebuilt without the held memory
    await a.persist.shutdownMusicLearningPersistence();

    const b = await proc(); // the next call, in a process that never saw the window
    await b.persist.ensureMusicLearningLoaded(u);
    const tags = b.mm.exportUserMusicMemories(u).memories.flatMap((m) => m.tags);
    expect(tags).toContain('celebration');
    expect(tags).not.toContain('comfort');
    const found = b.mm.findRelevantMemories(u, { emotionalState: 'stressed' });
    expect(found.map((m) => m.emotionalContext.state)).toEqual(['celebrating']);
  });

  it('(c) a later save never writes back a memory made in the held window', async () => {
    const u = uid('W');
    const a = await proc();
    const s1 = `held-${u}`;
    const startedAt = Date.now();
    a.mc.bindSessionUser(s1, u);
    a.mc.heldAfter(s1, "I'm 15.", { userId: u });
    a.purge.purgeHeldUser(u, s1, startedAt);
    a.mc.resetMinorCare(); // the hold lapsed: the next call is ordinary
    await new Promise((r) => {
      setTimeout(r, 5);
    }); // past the window's end
    await a.persist.ensureMusicLearningLoaded(u);
    // A memory from inside the window still in memory (read before the window was known)
    const held = {
      ...a.mm.storeMusicHelpedMemory(u, ctx('comfort'), 'presence' as never, {
        userResponse: SAID,
      })!,
      createdAt: startedAt,
    };
    a.mm.importUserMusicMemories(u, { memories: [held], preferences: [] });
    feedback(a, u, 'thinking'); // an ordinary memory, after the window
    await a.persist.flushMusicLearning(u);
    expect(tagsOf(u)).toContain('thinking');
    expect(tagsOf(u)).not.toContain('comfort');
  });

  it('(c) the scrub failed: the next load drops the held memories and saves the doc clean', async () => {
    const u = uid('F');
    const a = await proc();
    const s1 = `held-${u}`;
    const startedAt = Date.now();
    a.mc.bindSessionUser(s1, u);
    await a.persist.ensureMusicLearningLoaded(u);
    feedback(a, u, 'comfort', s1);
    await a.persist.flushMusicLearning(u);
    failTransactions.add(u);
    a.mc.heldAfter(s1, "I'm 15.", { userId: u });
    a.purge.purgeHeldUser(u, s1, startedAt);
    await new Promise((r) => {
      setTimeout(r, 20);
    });
    expect(tagsOf(u)).toContain('comfort'); // precondition: the scrub did not run
    failTransactions.delete(u);
    a.mc.resetMinorCare(); // the next call, same process: the window is known
    await a.persist.ensureMusicLearningLoaded(u);
    expect(a.mm.exportUserMusicMemories(u).memories).toEqual([]);
    await a.persist.flushAllMusicLearning(); // only what the load queued
    expect(storedMemories(u)).toEqual([]);
    expect(prefStates(u)).toEqual([]);
  });
});
