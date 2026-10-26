/**
 * MINOR_CARE: what a held caller said before giving their age, already flushed by the stores' own
 * timers (voice prosody every 10 s, celebration momentum every 3 s), never comes back.
 *
 * On #2826's first head the session-start reload read those entries back and the next save kept
 * them for good, inside the owner's history: the owner's voice baseline counted the child's
 * samples. Now the purge notes the held call's window (session start to purge), every later read
 * drops what was recorded inside it, and the purge rewrites the stored docs without it.
 *
 * Real stores, real timers (no manual flush before the age statement), the real purge,
 * session-start load and session-end save. Only Firestore is faked. A "process" is a fresh module
 * registry. Synthetic uids only.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createFakeEngagementFirestore,
  type FakeEngagementFirestore,
} from '../../engagement/__tests__/fake-engagement-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'now' } }));
vi.mock('../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => fake.db }));
vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));
vi.mock('../../superhuman/semantic-intelligence/index.js', () => ({
  clearSemanticIntelligenceCache: () => undefined,
}));
// #2906's index scrub runs with these (addHeldScrub); the vector store isn't under test here
vi.mock('../../data-layer/held-index-purge.js', () => ({ purgeHeldIndexEntries: async () => 0 }));

type Ref = { get: () => Promise<unknown>; set: (d: unknown, o?: unknown) => Promise<void> };
const firestore: FakeEngagementFirestore = createFakeEngagementFirestore();
const batch = () => {
  const ops: Array<() => Promise<void>> = [];
  return {
    set: (ref: Ref, d: unknown, o: unknown) => void ops.push(() => ref.set(d, o)),
    commit: async () => void (await Promise.all(ops.map((op) => op()))),
  };
};
/** The purge's scrub fails for these users, as an unavailable Firestore would. */
const failTransactions = new Set<string>();
/** ...or never settles, as a hung connection would. */
const hangTransactions = new Set<string>();
/** Transactions on a doc path this matches fail (one store's scrub alone). */
const failTxPath = { match: null as RegExp | null };
const runTransaction = async (fn: (tx: unknown) => Promise<unknown>) => {
  const ops: Array<() => Promise<void>> = [];
  const tx = {
    get: async (ref: Ref) => {
      const snap = (await ref.get()) as { data: () => { _userId?: string } | undefined };
      const id = snap.data()?._userId;
      if (id && failTransactions.has(id)) throw new Error('14 UNAVAILABLE: fake outage');
      if (id && hangTransactions.has(id)) await new Promise<never>(() => {});
      if (failTxPath.match?.test((ref as { path?: string }).path ?? ''))
        throw new Error('14 UNAVAILABLE: fake outage');
      return snap;
    },
    set: (ref: Ref, d: unknown, o?: unknown) => void ops.push(() => ref.set(d, o)),
  };
  const out = await fn(tx);
  for (const op of ops) await op();
  return out;
};
fake.db = { ...firestore.db, batch, runTransaction };

const VOICE = { pitchMean: 180, pitchRange: 20, pitchVariability: 0.3, energyMean: 60 };
let n = 0;
const uid = (tag: string) => `HwMc${tag}${String(++n).padStart(3, '0')}xQ7mN2pLk9Vb4Hc`;

async function proc() {
  vi.resetModules();
  const [persist, voice, momentum, purge, mc, learning] = await Promise.all([
    import('../persistence.js'),
    import('../voice-prosody-learning.js'),
    import('../celebration-momentum.js'),
    import('../../../agents/voice-agent/minor-care-purge.js'),
    import('../../../utils/minor-care.js'),
    import('../learning-style.js'),
  ]);
  return { persist, voice, momentum, purge, mc, learning };
}
type P = Awaited<ReturnType<typeof proc>>;

const speak = (p: P, u: string, label: string, count: number, emotion: string) => {
  for (let i = 0; i < count; i++)
    p.voice.recordVoiceSample(u, VOICE as never, {
      detectedEmotion: emotion,
      conversationContext: `${label} ${i}`,
    });
  p.momentum.recordWin(u, { type: 'effort_made', description: `${label} win`, tags: [] });
};
const endCall = async (p: P, u: string) => {
  await p.persist.saveTrustProfiles(u);
  await p.voice.flushVoiceProsodyPersistence();
  await p.momentum.flushCelebrationMomentumPersistence();
};
const endProc = async (p: P) => {
  await p.voice.shutdownVoiceProsody();
  await p.momentum.shutdownCelebrationMomentum();
};

const raw = (u: string, path: string) =>
  JSON.stringify(firestore.docs.get(`bogle_users/${u}/${path}`) ?? null);
const count = (s: string, label: string) =>
  (s.match(new RegExp(`${label} (\\d+|win)`, 'g')) ?? []).length;
const mirror = (u: string, d: string) => {
  const data = firestore.docs.get(`bogle_users/${u}/trust_profiles/${d}`)?.data;
  return data === undefined ? undefined : JSON.parse(data as string);
};
/** What every store holds for this user: each doc, and labels from the held call. */
function stored(u: string) {
  const voice = raw(u, 'voice_prosody/data');
  const momentum = raw(u, 'celebration_momentum/profile');
  const baseline = mirror(u, 'voice_prosody');
  const wins = mirror(u, 'celebration_momentum');
  return {
    voice: { OLD: count(voice, 'OLD'), HELD: count(voice, 'HELD'), NEW: count(voice, 'NEW') },
    baselineSampleCount: baseline?.sampleCount,
    baselineEmotions: (baseline?.emotionalProfiles ?? []).map(
      (e: { emotion: string }) => e.emotion
    ),
    momentum: {
      OLD: count(momentum, 'OLD'),
      HELD: count(momentum, 'HELD'),
      NEW: count(momentum, 'NEW'),
    },
    totalWins: (
      firestore.docs.get(`bogle_users/${u}/celebration_momentum/profile`) as { totalWins?: number }
    )?.totalWins,
    winStreak: (wins?.streaks ?? []).find((t: { type: string }) => t.type === 'type_specific')
      ?.count,
    mirrorWins: (wins?.wins ?? []).map((w: { description: string }) => w.description),
  };
}

/** Older history, stored by an earlier process: 12 neutral voice samples and a win. */
async function seed(u: string) {
  vi.stubEnv('MINOR_CARE', 'on');
  const p = await proc();
  await p.persist.loadTrustProfiles(u);
  speak(p, u, 'OLD', 12, 'neutral');
  await endCall(p, u);
  await endProc(p);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('MINOR_CARE: entries flushed before the age statement never come back', () => {
  const same = uid('S'); // the ordinary call runs in the same process
  const noScrub = uid('N'); // the same, and the purge's scrub of the stored docs fails
  const restart = uid('R'); // the ordinary call runs in a new process (no held window in memory)
  // the scrub fails, and the next call runs in a new process (a restart, or another replica): only
  // the window the purge stored in minor_care_holds tells that process what to drop
  const noScrubElsewhere = uid('X');
  const all = [same, noScrub, restart, noScrubElsewhere];
  let p: P;
  let afterPurge: Record<string, ReturnType<typeof stored>>;
  let heldBeforeAge: Record<string, ReturnType<typeof stored>>;

  beforeAll(async () => {
    for (const u of all) await seed(u);
    vi.stubEnv('MINOR_CARE', 'on');
    p = await proc();
    for (const u of all) {
      p.mc.bindSessionUser(`held-${u}`, u); // session start
      await p.persist.loadTrustProfiles(u);
      speak(p, u, 'HELD', 4, 'joy'); // said before their age
    }
    await new Promise((r) => {
      setTimeout(r, 11_500);
    }); // the stores' own sync timers, no flush call
    heldBeforeAge = Object.fromEntries(all.map((u) => [u, stored(u)]));
    failTransactions.add(noScrub);
    failTransactions.add(noScrubElsewhere);
    for (const u of all) {
      const s1 = `held-${u}`;
      p.mc.heldAfter(s1, "I'm 15.", { userId: u });
      expect(p.mc.memoryHeld(s1)).toBe(true);
      p.purge.purgeHeldUser(u, s1); // the held call's end
    }
    await vi // the scrub runs in the background; the tests below say whether it cleaned up
      .waitFor(() => expect(stored(same).voice.HELD).toBe(0), { timeout: 2000 })
      .catch(() => undefined);
    afterPurge = Object.fromEntries(all.map((u) => [u, stored(u)]));
    p.mc.resetMinorCare(); // the hold lapsed: the next calls are ordinary
    vi.unstubAllEnvs();
  }, 60_000);

  it('the timers had stored the held caller’s entries before the age statement', () => {
    for (const u of all) {
      expect(heldBeforeAge[u].voice.HELD).toBe(4);
      expect(heldBeforeAge[u].momentum.HELD).toBe(1);
    }
  });

  it('the purge rewrites the stored docs without them, keeping the older history', () => {
    for (const u of [same, restart]) {
      expect(afterPurge[u].voice).toEqual({ OLD: 12, HELD: 0, NEW: 0 });
      expect(afterPurge[u].momentum).toEqual({ OLD: 1, HELD: 0, NEW: 0 });
      expect(afterPurge[u].totalWins).toBe(1);
    }
    for (const u of [noScrub, noScrubElsewhere]) expect(afterPurge[u].voice.HELD).toBe(4); // scrub failed
  });

  for (const [name, who, fresh] of [
    ['the same process', () => same, false],
    ['the same process, after the scrub failed', () => noScrub, false],
    ['a new process', () => restart, true],
    ['a new process, after the scrub failed', () => noScrubElsewhere, true],
  ] as const) {
    it(`an ordinary call in ${name} keeps the older history and nothing from the held call`, async () => {
      const u = who();
      vi.stubEnv('MINOR_CARE', 'on');
      const q = fresh ? await proc() : p;
      q.mc.bindSessionUser(`next-${u}`, u);
      expect(q.mc.userHeld(u)).toBe(false);
      await q.persist.loadTrustProfiles(u);
      const memory = JSON.stringify({
        baseline: q.voice.getBaseline(u),
        momentum: q.momentum.getMomentumProfile(u),
      });
      expect(memory).not.toContain('HELD');
      expect(q.voice.getBaseline(u)?.sampleCount).toBe(12);
      speak(q, u, 'NEW', 10, 'neutral');
      await endCall(q, u);
      const after = stored(u);
      expect(after.voice).toEqual({ OLD: 12, HELD: 0, NEW: 10 });
      expect(after.baselineSampleCount).toBe(22); // the owner's baseline, not the child's voice
      expect(after.baselineEmotions).not.toContain('joy');
      expect(after.momentum).toEqual({ OLD: 1, HELD: 0, NEW: 1 });
      expect(after.totalWins).toBe(2);
      expect(after.mirrorWins).toEqual(['OLD win', 'NEW win']);
      expect(after.winStreak).toBe(2); // OLD, NEW: the held win's step is undone
      expect(
        [...firestore.docs]
          .filter(([path]) => path.includes(u))
          .map(([, d]) => JSON.stringify(d))
          .join()
      ).not.toContain('HELD');
      failTransactions.delete(u);
    });
  }
});

describe('MINOR_CARE: the held window, store by store', () => {
  it('a call that records nothing still leaves the stored docs without the held entries', async () => {
    const u = uid('Q2');
    await seed(u);
    vi.stubEnv('MINOR_CARE', 'on');
    const p = await proc();
    p.mc.bindSessionUser(`held-${u}`, u);
    await p.persist.loadTrustProfiles(u);
    speak(p, u, 'HELD', 4, 'joy');
    await p.voice.flushVoiceProsodyPersistence(); // what the timers did above
    await p.momentum.flushCelebrationMomentumPersistence();
    failTransactions.add(u); // the purge's scrub fails: only the reload can drop them
    p.mc.heldAfter(`held-${u}`, "I'm 15.", { userId: u });
    p.purge.purgeHeldUser(u, `held-${u}`);
    await new Promise((r) => {
      setTimeout(r, 20);
    });
    expect(stored(u).voice.HELD).toBe(4);
    p.mc.resetMinorCare();
    p.mc.bindSessionUser(`next-${u}`, u);
    await p.persist.loadTrustProfiles(u);
    await endCall(p, u); // says nothing: no new sample or win would rewrite the docs
    expect(stored(u).voice).toEqual({ OLD: 12, HELD: 0, NEW: 0 });
    expect(stored(u).momentum).toEqual({ OLD: 1, HELD: 0, NEW: 0 });
    failTransactions.delete(u);
    await endProc(p);
  });

  it('a purge without a bound session uses the call start it is given', async () => {
    const p = await proc();
    const held = await import('../held-window.js');
    const u = uid('T');
    const start = Date.now() - 60_000;
    p.purge.purgeHeldUser(u, 'never-bound', start);
    expect(held.recordedWhileHeld(u, start + 1)).toBe(true);
    expect(held.recordedWhileHeld(u, start - 1)).toBe(false);
    expect(held.recordedWhileHeld(u, Date.now() + 1000)).toBe(false); // after the purge: kept
  });

  it('voice: fewer kept samples than a baseline needs drops the baseline built with the held ones', async () => {
    const p = await proc();
    const held = await import('../held-window.js');
    const u = uid('V');
    const at = (ms: number) => new Date(ms).toISOString();
    const t0 = Date.parse('2026-10-01T10:00:00Z');
    const sample = (ms: number, emotion: string) => ({
      timestamp: at(ms),
      characteristics: VOICE,
      detectedEmotion: emotion,
    });
    const data = {
      baseline: { userId: u, sampleCount: 11, establishedAt: at(t0), lastUpdated: at(t0) },
      samples: [
        ...Array.from({ length: 5 }, (_, i) => sample(t0 + i, 'neutral')),
        ...Array.from({ length: 6 }, (_, i) => sample(t0 + 1000 + i, 'joy')),
      ],
    };
    expect(p.voice.withoutHeldSamples(u, data as never)).toBeNull(); // no window: untouched
    held.noteHeldWindow(u, t0 + 1000, t0 + 2000);
    const kept = p.voice.withoutHeldSamples(u, data as never);
    expect(kept?.samples).toHaveLength(5);
    expect(kept?.baseline).toBeNull();
    expect(p.voice.getBaseline(u)).toBeNull(); // memory unchanged
    const enough = {
      ...data,
      samples: [
        ...Array.from({ length: 7 }, (_, i) => sample(t0 + 10 + i, 'neutral')),
        ...data.samples,
      ],
    };
    const rebuilt = p.voice.withoutHeldSamples(u, enough as never); // 12 kept: a baseline of 12
    expect(rebuilt?.baseline).toMatchObject({ sampleCount: 12, establishedAt: at(t0) });
    expect(p.voice.getBaseline(u)).toBeNull(); // still: the purge's scrub never fills memory
  });

  it('momentum: a held win that broke the daily streak gives it back; themes count only kept wins', async () => {
    const p = await proc();
    const held = await import('../held-window.js');
    const u = uid('M');
    const at = (ms: number) => new Date(ms).toISOString();
    const day = 24 * 60 * 60 * 1000;
    const t0 = Date.now() - 5 * day;
    const win = (id: string, ms: number) => ({
      id,
      type: 'self_care',
      description: id,
      detectedAt: at(ms),
      celebrated: false,
      tags: [],
    });
    const streak = (id: string, type: string, ms: number, active: boolean, count: number) => ({
      id,
      type,
      winType: type === 'daily' ? undefined : 'self_care',
      count,
      startDate: at(ms),
      lastWinDate: at(ms),
      active,
      celebrated: false,
    });
    const tHeld = Date.now() - 1000;
    const data = {
      userId: u,
      wins: [win('OLD', t0), win('HELD', tHeld)],
      streaks: [
        streak('d0', 'daily', t0, false, 1),
        streak('d1', 'daily', tHeld, true, 1),
        streak('s0', 'type_specific', t0, true, 2),
      ],
      themes: [
        { type: 'self_care', count: 2, percentage: 100, trend: 'stable', lastSeen: at(tHeld) },
      ],
      momentumScore: 10,
      momentumTrend: 'stable',
      consistencyScore: 0,
      totalWins: 2,
      winsThisWeek: 2,
      winsThisMonth: 2,
      comebackDetected: false,
      breakthroughMoment: false,
      lastUpdated: at(tHeld),
    };
    data.streaks[2].lastWinDate = at(tHeld); // the held win extended the type streak
    held.noteHeldWindow(u, tHeld - 10, tHeld + 10);
    const kept = p.momentum.withoutHeldWins(u, data as never)!;
    expect(kept.wins.map((w) => w.description)).toEqual(['OLD']);
    expect(kept.totalWins).toBe(1);
    expect(kept.winsThisWeek).toBe(1);
    expect(kept.streaks.map((s) => [s.id, s.active, s.count])).toEqual([
      ['d0', true, 1],
      ['s0', true, 1],
    ]);
    expect(kept.themes.map((t) => [t.type, t.count])).toEqual([['self_care', 1]]);
  });
});

/** A held call: bound, loaded, speaks and wins (flushed), says 15, purged at its end. */
async function heldCall(p: P, u: string, opts: { startedAt?: number } = {}) {
  const s1 = `held-${u}`;
  p.mc.bindSessionUser(s1, u);
  await p.persist.loadTrustProfiles(u);
  speak(p, u, 'HELD', 4, 'fear');
  await p.voice.flushVoiceProsodyPersistence(); // what the stores' timers do
  await p.momentum.flushCelebrationMomentumPersistence();
  p.mc.heldAfter(s1, "I'm 15.", { userId: u });
  p.purge.purgeHeldUser(u, s1, opts.startedAt);
  await new Promise((r) => {
    setTimeout(r, 50);
  });
}
const holdDoc = (u: string) =>
  firestore.docs.get(`minor_care_holds/${u}`) as
    | { windows?: Array<{ start: number; end: number; scrubbed: boolean }>; expireAt?: Date }
    | undefined;
const DAY = 24 * 60 * 60 * 1000;

describe('MINOR_CARE: the held window is stored, so every process drops what it covers', () => {
  afterEach(() => {
    failTxPath.match = null;
    firestore.failReads.match = null;
    firestore.hangReads.match = null;
    failTransactions.clear();
    hangTransactions.clear();
  });

  const MIRRORS = ['trust_profiles/voice_prosody', 'trust_profiles/celebration_momentum'];
  const STORES = ['voice_prosody/data', 'celebration_momentum/profile'];
  for (const [name, setup] of [
    [
      'the held windows read never settles',
      (u: string) => {
        firestore.hangReads.match = new RegExp(`^minor_care_holds/${u}$`);
      },
    ],
    ['the scrub retry never settles', (u: string) => void hangTransactions.add(u)],
    [
      'an earlier session-start read never settles',
      (u: string) => {
        firestore.hangReads.match = new RegExp(`^bogle_users/${u}/trust_profiles/boundaries$`);
      },
    ],
  ] as const) {
    it(`${name}: the session-end save writes neither mirror, and doesn't wait for it`, async () => {
      const u = uid('G');
      await seed(u);
      vi.stubEnv('MINOR_CARE', 'on');
      const p = await proc();
      failTransactions.add(u); // the purge's scrub fails: the window stays unscrubbed
      await heldCall(p, u);
      await endProc(p);
      failTransactions.delete(u);
      const before = [...MIRRORS, ...STORES].map((d) => raw(u, d));
      expect(before.every((d) => d !== 'null')).toBe(true);
      setup(u);
      const q = await proc(); // the next call, on another process
      q.mc.bindSessionUser(`next-${u}`, u);
      let settled = false;
      void q.persist.loadTrustProfiles(u).finally(() => (settled = true));
      speak(q, u, 'NEW', 10, 'neutral');
      q.learning.recordLearningSignals(u, 'can you show me an example, step by step?');
      const ended = await Promise.race([
        endCall(q, u).then(() => 'ended'),
        new Promise((r) => {
          setTimeout(() => r('waited'), 5000);
        }),
      ]);
      expect(ended).toBe('ended');
      expect(settled).toBe(false); // the read (or scrub) is still hanging
      expect([...MIRRORS, ...STORES].map((d) => raw(u, d))).toEqual(before);
      if (name.startsWith('an earlier'))
        expect(raw(u, 'trust_profiles/learning_style')).toBe('null');
      await endProc(q);
    });
  }

  it('the purge stores its window, with no TTL until scrubbed; a scrub that failed is redone at the next session start, in any process', async () => {
    const u = uid('Y');
    await seed(u);
    vi.stubEnv('MINOR_CARE', 'on');
    const p = await proc();
    failTransactions.add(u); // the purge's scrub fails
    await heldCall(p, u);
    expect(stored(u).voice.HELD).toBe(4);
    const window = holdDoc(u)?.windows ?? [];
    expect(window).toHaveLength(1);
    expect(window[0].scrubbed).toBe(false);
    expect(window[0].end - window[0].start).toBeGreaterThanOrEqual(0);
    expect(holdDoc(u)!.expireAt, 'unscrubbed: it must not expire first').toBeNull();
    await endProc(p);
    failTransactions.delete(u); // Firestore is back
    const q = await proc(); // the next call lands on another process
    q.mc.bindSessionUser(`next-${u}`, u);
    await q.persist.loadTrustProfiles(u);
    // before any store timer runs: the session start's own scrub cleaned both docs
    expect(stored(u).voice).toEqual({ OLD: 12, HELD: 0, NEW: 0 });
    expect(stored(u).momentum).toEqual({ OLD: 1, HELD: 0, NEW: 0 });
    expect(holdDoc(u)?.windows?.map((w) => w.scrubbed)).toEqual([true]);
    expect(holdDoc(u)!.expireAt!.getTime() - window[0].end).toBe(90 * DAY); // kept 90 days once clean
    await endProc(q);
  });

  it('only the music scrub fails: the window stays unscrubbed, and the next session start retries it', async () => {
    const u = uid('Mu');
    await seed(u);
    vi.stubEnv('MINOR_CARE', 'on');
    const now = Date.now();
    const memory = (id: string, at: number) => ({
      id,
      createdAt: new Date(at).toISOString(),
      emotionalContext: { state: 'sad' },
      music: { genre: 'lofi', mood: 'calm' },
      evidence: { userMentioned: true },
      effectiveTransition: 'sad_to_calm',
      confidence: 0.8,
      tags: [id],
    });
    const music = `bogle_users/${u}/music_learning/memories`;
    firestore.docs.set(music, {
      userId: u,
      _userId: u,
      updatedAt: new Date(now).toISOString(),
      memories: [memory('OLDM', now - 2 * DAY), memory('HELDM', now - 30_000)],
      preferences: [],
    });
    const p = await proc();
    failTxPath.match = /music_learning\/memories$/; // the voice and momentum scrubs succeed
    await heldCall(p, u, { startedAt: now - 60_000 });
    await vi.waitFor(() => expect(stored(u).voice.HELD).toBe(0), { timeout: 2000 });
    expect(raw(u, 'music_learning/memories')).toContain('HELDM');
    expect(holdDoc(u)?.windows?.map((w) => w.scrubbed)).toEqual([false]);
    await endProc(p);
    failTxPath.match = null;
    const q = await proc(); // the next call, on another process
    q.mc.bindSessionUser(`next-${u}`, u);
    await q.persist.loadTrustProfiles(u);
    expect(raw(u, 'music_learning/memories')).not.toContain('HELDM');
    expect(raw(u, 'music_learning/memories')).toContain('OLDM');
    expect(holdDoc(u)?.windows?.map((w) => w.scrubbed)).toEqual([true]);
    await endProc(q);
  });

  it('windows that cannot be read keep voice and momentum unwritten; the next good read cleans them', async () => {
    const u = uid('Z');
    await seed(u);
    vi.stubEnv('MINOR_CARE', 'on');
    const p = await proc();
    failTransactions.add(u);
    await heldCall(p, u);
    await endProc(p);
    const before = [raw(u, 'voice_prosody/data'), raw(u, 'celebration_momentum/profile')];
    const mirrors = [
      raw(u, 'trust_profiles/voice_prosody'),
      raw(u, 'trust_profiles/celebration_momentum'),
    ];
    failTransactions.delete(u);
    firestore.failReads.match = new RegExp(`^minor_care_holds/${u}$`);
    const q = await proc();
    q.mc.bindSessionUser(`next-${u}`, u);
    await q.persist.loadTrustProfiles(u);
    speak(q, u, 'NEW', 10, 'neutral');
    await endCall(q, u);
    expect([raw(u, 'voice_prosody/data'), raw(u, 'celebration_momentum/profile')]).toEqual(before);
    expect([
      raw(u, 'trust_profiles/voice_prosody'),
      raw(u, 'trust_profiles/celebration_momentum'),
    ]).toEqual(mirrors);
    await endProc(q);
    firestore.failReads.match = null;
    const r = await proc();
    r.mc.bindSessionUser(`later-${u}`, u);
    await r.persist.loadTrustProfiles(u);
    await endCall(r, u);
    expect(stored(u).voice).toEqual({ OLD: 12, HELD: 0, NEW: 0 });
    expect(stored(u).momentum).toEqual({ OLD: 1, HELD: 0, NEW: 0 });
    await endProc(r);
  });

  it('the window starts at the earlier of the call start and the bind', async () => {
    const p = await proc();
    const held = await import('../held-window.js');
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const t0 = Date.parse('2026-10-25T12:00:00Z');
      const a = uid('Ea'); // the call started before its session was bound to the user
      vi.setSystemTime(t0 + 100);
      p.mc.bindSessionUser(`s-${a}`, a);
      vi.setSystemTime(t0 + 5000);
      p.purge.purgeHeldUser(a, `s-${a}`, t0);
      expect(held.recordedWhileHeld(a, t0)).toBe(true);
      expect(held.recordedWhileHeld(a, t0 - 1)).toBe(false);
      const b = uid('Eb'); // bound before the start the cleanup passes
      vi.setSystemTime(t0);
      p.mc.bindSessionUser(`s-${b}`, b);
      vi.setSystemTime(t0 + 5000);
      p.purge.purgeHeldUser(b, `s-${b}`, t0 + 100);
      expect(held.recordedWhileHeld(b, t0)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('momentum: a held win that extended the daily streak loses that step', async () => {
    const p = await proc();
    const held = await import('../held-window.js');
    const u = uid('D');
    const at = (ms: number) => new Date(ms).toISOString();
    const now = Date.now();
    const win = (id: string, ms: number) => ({
      id,
      type: 'self_care',
      description: id,
      detectedAt: at(ms),
      celebrated: false,
      tags: [],
    });
    const data = {
      userId: u,
      wins: [win('OLD1', now - 3 * DAY), win('OLD2', now - 2 * DAY), win('OLD3', now - DAY)],
      streaks: [
        {
          id: 'd',
          type: 'daily',
          count: 4,
          startDate: at(now - 3 * DAY),
          lastWinDate: at(now - 1000),
          active: true,
          celebrated: false,
        },
      ],
      themes: [],
      momentumScore: 10,
      momentumTrend: 'stable',
      consistencyScore: 0,
      totalWins: 4,
      winsThisWeek: 4,
      winsThisMonth: 4,
      comebackDetected: false,
      breakthroughMoment: false,
      lastUpdated: at(now - 1000),
    };
    data.wins.push(win('HELD', now - 1000));
    held.noteHeldWindow(u, now - 2000, now);
    const kept = p.momentum.withoutHeldWins(u, data as never)!;
    expect(kept.streaks.map((s) => [s.type, s.count, s.active])).toEqual([['daily', 3, true]]);
    expect(new Date(kept.streaks[0].lastWinDate).getTime()).toBe(now - DAY);
  });

  it('a sample unflushed at the age statement never stops this process storing the user later', async () => {
    const u = uid('L');
    await seed(u);
    vi.stubEnv('MINOR_CARE', 'on');
    const p = await proc();
    const s1 = `held-${u}`;
    p.mc.bindSessionUser(s1, u);
    await p.persist.loadTrustProfiles(u);
    speak(p, u, 'HELD', 1, 'fear');
    p.mc.heldAfter(s1, "I'm 15.", { userId: u });
    await p.voice.flushVoiceProsodyPersistence(); // a tick during the hold drops it
    p.purge.purgeHeldUser(u, s1);
    await new Promise((r) => {
      setTimeout(r, 50);
    });
    p.mc.resetMinorCare(); // the hold lapsed
    p.mc.bindSessionUser(`next-${u}`, u);
    await p.persist.loadTrustProfiles(u);
    speak(p, u, 'NEW', 10, 'neutral');
    await endCall(p, u);
    expect(stored(u).voice).toEqual({ OLD: 12, HELD: 0, NEW: 10 });
    await endProc(p);
  });
});

describe('MINOR_CARE flags off: nothing is held, purged or dropped', () => {
  it('a call that says "I\'m 15." is saved like any other, on top of the older history', async () => {
    const u = uid('O');
    await seed(u);
    vi.stubEnv('MINOR_CARE', 'off');
    vi.stubEnv('MINOR_CARE_OWNERS', 'off');
    firestore.failReads.match = new RegExp(`^minor_care_holds/`); // never read with the flag off
    const p = await proc();
    const s1 = `s1-${u}`;
    p.mc.bindSessionUser(s1, u);
    await p.persist.loadTrustProfiles(u);
    speak(p, u, 'CALL1', 4, 'neutral');
    expect(p.mc.heldAfter(s1, "I'm 15.", { userId: u })).toBe(false);
    await endCall(p, u); // not held: its cleanup saves as usual, and never purges
    p.mc.bindSessionUser(`s2-${u}`, u);
    await p.persist.loadTrustProfiles(u);
    speak(p, u, 'NEW', 10, 'neutral');
    await endCall(p, u);
    const voice = raw(u, 'voice_prosody/data');
    expect([count(voice, 'OLD'), count(voice, 'CALL1'), count(voice, 'NEW')]).toEqual([12, 4, 10]);
    expect(mirror(u, 'voice_prosody').sampleCount).toBe(26);
    firestore.failReads.match = null;
    await endProc(p);
  });
});
