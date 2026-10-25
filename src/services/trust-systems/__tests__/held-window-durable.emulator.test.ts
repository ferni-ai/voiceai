/**
 * MINOR_CARE on a Firestore emulator: a held call's window is stored, so a next call in ANY process
 * drops what the held caller left in storage, even when the purge's scrub never completed.
 *
 * On #2826's head the window lived only in the purging process's memory. If the scrub's transaction
 * failed, or the process died before it committed, and the next call ran on another replica (prod
 * runs 1 to 8), the held caller's voice samples and win came back for good: the owner's baseline
 * carried a `fear:4` emotion profile. Now the purge stores the window in minor_care_holds/{uid},
 * every session start reads it back before the stores load, and redoes a scrub that never finished.
 *
 * Real firebase-admin on the emulator, the real stores with their own sync timers (voice 10 s,
 * momentum 3 s; no flush call before the age statement), the real purge, session-start load and
 * session-end save. A "process" is a fresh module registry. Faults are injected into the SDK's
 * DocumentReference.get and Transaction.get. Synthetic uids only. Skips without the emulator.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/app', async () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', async () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../superhuman/semantic-intelligence/index.js', () => ({
  clearSemanticIntelligenceCache: () => undefined,
}));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-held-window';

type GFS = typeof import('@google-cloud/firestore');
type Snap = { exists: boolean; data: () => Record<string, unknown> | undefined };
let scanDb: { doc: (path: string) => { get: () => Promise<Snap> } };
let failRead: RegExp | null = null; // DocumentReference.get on these paths rejects
let hangRead: RegExp | null = null; // ...or never settles (a hung connection)
let failTx: RegExp | null = null; // Transaction.get on these paths...
let txMode: 'fail' | 'hang' | 'unavailable-once' = 'fail';
let txPaths: string[] = []; // every Transaction.get on a faulted path, in order
const SCAN = Symbol('scan');

async function setup() {
  if (scanDb) return;
  const gfs = await vi.importActual<GFS>('@google-cloud/firestore');
  scanDb = new gfs.Firestore({ projectId: process.env.GCLOUD_PROJECT }) as never;
  const ref = gfs.DocumentReference.prototype as unknown as {
    get: (...a: unknown[]) => Promise<unknown>;
  };
  const get = ref.get;
  ref.get = function (this: { path: string; [SCAN]?: boolean }, ...a: unknown[]) {
    if (hangRead?.test(this.path) && !this[SCAN]) return new Promise<never>(() => {});
    if (failRead?.test(this.path) && !this[SCAN])
      return Promise.reject(Object.assign(new Error('14 UNAVAILABLE: injected'), { code: 14 }));
    return get.apply(this, a);
  };
  const tx = gfs.Transaction.prototype as unknown as {
    get: (...a: unknown[]) => Promise<unknown>;
  };
  const txGet = tx.get;
  tx.get = function (this: unknown, ...a: unknown[]) {
    const path = (a[0] as { path?: string })?.path;
    if (failTx && path && failTx.test(path)) {
      txPaths.push(path);
      if (txMode === 'hang') return new Promise<never>(() => {}); // the process died first
      if (txMode === 'fail') return Promise.reject(new Error('injected transaction failure'));
      if (txPaths.indexOf(path) === txPaths.length - 1)
        // its first try: a transient outage
        return Promise.reject(Object.assign(new Error('14 UNAVAILABLE: injected'), { code: 14 }));
    }
    return txGet.apply(this, a);
  };
}

let n = 0;
const uid = (tag: string) =>
  `HwDur${tag}${String(++n).padStart(3, '0')}${Math.random().toString(36).slice(2, 10)}`.padEnd(
    28,
    'Q'
  );

async function proc() {
  vi.resetModules();
  const [persist, voice, momentum, purge, mc] = await Promise.all([
    import('../persistence.js'),
    import('../voice-prosody-learning.js'),
    import('../celebration-momentum.js'),
    import('../../../agents/voice-agent/minor-care-purge.js'),
    import('../../../utils/minor-care.js'),
  ]);
  return { persist, voice, momentum, purge, mc };
}
type P = Awaited<ReturnType<typeof proc>>;
const endProc = async (p: P) => {
  await p.voice.shutdownVoiceProsody();
  await p.momentum.shutdownCelebrationMomentum();
};
const endCall = async (p: P, u: string) => {
  await p.persist.saveTrustProfiles(u);
  await p.voice.flushVoiceProsodyPersistence();
  await p.momentum.flushCelebrationMomentumPersistence();
};
const sleep = (ms: number) =>
  new Promise((r) => {
    setTimeout(r, ms);
  });

const CHARS = { pitchMean: 180, pitchRange: 20, pitchVariability: 0.3, energyMean: 0.5 };
function speak(p: P, u: string, label: string, count: number, emotion: string): void {
  for (let i = 0; i < count; i++) {
    const c = { ...CHARS, pitchMean: 150 + ((i * 7) % 60) };
    p.voice.recordVoiceSample(u, c as never, {
      detectedEmotion: emotion,
      conversationContext: `${label} ${i}`,
    });
  }
}
const win = (p: P, u: string, label: string, type = 'effort_made') =>
  p.momentum.recordWin(u, { type, description: `${label}-win`, tags: [] } as never);

async function read(path: string): Promise<Record<string, unknown> | null> {
  const ref = scanDb.doc(path) as unknown as { [SCAN]?: boolean; get: () => Promise<Snap> };
  ref[SCAN] = true;
  const s = await ref.get();
  return s.exists ? (s.data() ?? null) : null;
}
const parse = (d: Record<string, unknown> | null) =>
  d && typeof d.data === 'string' ? JSON.parse(d.data) : null;
const count = (v: unknown, re: RegExp) => (JSON.stringify(v ?? null).match(re) ?? []).length;

/** What storage holds for the user: per label, in every doc, plus the derived values. */
async function stored(u: string, labels: string[]) {
  const voice = await read(`bogle_users/${u}/voice_prosody/data`);
  const mom = await read(`bogle_users/${u}/celebration_momentum/profile`);
  const vm = parse(await read(`bogle_users/${u}/trust_profiles/voice_prosody`));
  const mm = parse(await read(`bogle_users/${u}/trust_profiles/celebration_momentum`));
  const row: Record<string, unknown> = {};
  for (const l of labels) {
    row[`voice.${l}`] = count(voice?.samples, new RegExp(`"${l} \\d+"`, 'g'));
    row[`mom.${l}`] = count(mom?.wins, new RegExp(`${l}-win`, 'g'));
    row[`momMirror.${l}`] = count(mm?.wins, new RegExp(`${l}-win`, 'g'));
  }
  const emotions = (b: unknown) =>
    (
      (b as { emotionalProfiles?: Array<{ emotion: string; sampleCount: number }> } | null)
        ?.emotionalProfiles ?? []
    ).map((e) => `${e.emotion}:${e.sampleCount}`);
  row['voice.emotions'] = emotions(voice?.baseline);
  row['mirror.emotions'] = emotions(vm);
  row['mirror.sampleCount'] = vm?.sampleCount ?? null;
  row['mom.totalWins'] = mom?.totalWins ?? null;
  row['momMirror.totalWins'] = mm?.totalWins ?? null;
  return row;
}
const windows = async (u: string) =>
  ((await read(`minor_care_holds/${u}`))?.windows ?? []) as Array<{
    start: number;
    end: number;
    scrubbed: boolean;
  }>;

/** Older history, stored by an earlier process: 12 neutral samples and two wins. */
async function seed(u: string) {
  const p = await proc();
  p.mc.bindSessionUser(`seed-${u}`, u);
  await p.persist.loadTrustProfiles(u);
  speak(p, u, 'OLD', 12, 'neutral');
  win(p, u, 'OLDa', 'followed_through');
  win(p, u, 'OLDb');
  await endCall(p, u);
  await endProc(p);
}

/** A held call: bound, loaded, speaks and wins (the stores' timers flush them), says 15, purged. */
async function heldCall(p: P, u: string) {
  const s1 = `held-${u}`;
  const startedAt = Date.now();
  p.mc.bindSessionUser(s1, u);
  await p.persist.loadTrustProfiles(u);
  speak(p, u, 'HELD', 4, 'fear');
  win(p, u, 'HELD', 'courage_moment');
  await sleep(11_500); // the stores' own timers: no flush call
  const pre = await stored(u, ['HELD']);
  expect(p.mc.heldAfter(s1, "I'm 15.", { userId: u })).toBe(true);
  p.purge.purgeHeldUser(u, s1, startedAt);
  await sleep(2000);
  return pre;
}

afterEach(() => {
  failRead = null;
  hangRead = null;
  failTx = null;
  txPaths = [];
  vi.unstubAllEnvs();
});
const on = () => {
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('MINOR_CARE_OWNERS', 'on');
};

describe.skipIf(!emulator)('MINOR_CARE: the stored held window (Firestore emulator)', () => {
  for (const mode of ['fail', 'hang'] as const)
    it(`the scrub ${mode === 'fail' ? 'fails' : 'never completes'}, and the next call runs in another process`, async () => {
      await setup();
      on();
      const u = uid(mode === 'fail' ? 'F' : 'H');
      await seed(u);
      let p = await proc();
      failTx = new RegExp(`^bogle_users/${u}/`);
      txMode = mode;
      const pre = await heldCall(p, u);
      expect(pre['voice.HELD'], 'precondition: the timers stored the held samples').toBe(4);
      expect(pre['mom.HELD'], 'precondition: the timers stored the held win').toBe(1);
      const afterPurge = await stored(u, ['OLD', 'HELD']);
      expect(afterPurge['voice.HELD'], 'precondition: the scrub did not clean them').toBe(4);
      expect((await windows(u)).map((w) => w.scrubbed)).toEqual([false]);
      await endProc(p); // the purging process is gone, or the next call lands on another replica
      failTx = null;
      p = await proc();
      p.mc.bindSessionUser(`next-${u}`, u);
      await p.persist.loadTrustProfiles(u);
      const memory = JSON.stringify([p.voice.getBaseline(u), p.momentum.getMomentumProfile(u)]);
      expect(memory).not.toMatch(/HELD|fear|courage_moment/);
      // the session start redid the scrub, before any store timer ran
      expect((await stored(u, ['HELD']))['voice.HELD']).toBe(0);
      expect((await windows(u)).map((w) => w.scrubbed)).toEqual([true]);
      speak(p, u, 'NEW', 10, 'neutral');
      win(p, u, 'NEW');
      await endCall(p, u);
      await sleep(500);
      const after = await stored(u, ['OLD', 'HELD', 'NEW']);
      await endProc(p);
      for (const k of ['voice', 'mom', 'momMirror']) expect(after[`${k}.HELD`], k).toBe(0);
      expect(after['voice.OLD']).toBe(12);
      expect(after['voice.NEW']).toBe(10);
      expect(after['mirror.sampleCount']).toBe(22);
      expect(JSON.stringify([after['voice.emotions'], after['mirror.emotions']])).not.toContain(
        'fear'
      );
      expect(after['mom.totalWins']).toBe(3);
      expect(after['momMirror.totalWins']).toBe(3);
    }, 90_000);

  it('the held windows cannot be read: voice and momentum stay held, nothing is saved over them', async () => {
    await setup();
    on();
    const u = uid('R');
    await seed(u);
    let p = await proc();
    failTx = new RegExp(`^bogle_users/${u}/`);
    txMode = 'fail';
    await heldCall(p, u);
    await endProc(p);
    failTx = null;
    const docs = async () =>
      JSON.stringify(
        await Promise.all(
          ['voice_prosody/data', 'celebration_momentum/profile', 'trust_profiles/voice_prosody']
            .concat('trust_profiles/celebration_momentum')
            .map((d) => read(`bogle_users/${u}/${d}`))
        )
      );
    const before = await docs();
    failRead = new RegExp(`^minor_care_holds/${u}$`);
    p = await proc();
    p.mc.bindSessionUser(`next-${u}`, u);
    await p.persist.loadTrustProfiles(u);
    speak(p, u, 'NEW', 10, 'neutral');
    win(p, u, 'NEW');
    await endCall(p, u);
    await sleep(3500); // past a momentum timer tick
    await endProc(p);
    expect(await docs()).toBe(before);
    failRead = null;
    p = await proc(); // a good read later cleans them
    p.mc.bindSessionUser(`later-${u}`, u);
    await p.persist.loadTrustProfiles(u);
    await endCall(p, u);
    await endProc(p);
    const after = await stored(u, ['OLD', 'HELD']);
    expect([after['voice.OLD'], after['voice.HELD'], after['mom.HELD']]).toEqual([12, 0, 0]);
  }, 90_000);

  it("a transient UNAVAILABLE on the scrub's transaction: the SDK retries it, and the purge cleans up", async () => {
    await setup();
    on();
    const u = uid('U');
    await seed(u);
    const p = await proc();
    failTx = new RegExp(`^bogle_users/${u}/`);
    txMode = 'unavailable-once';
    await heldCall(p, u);
    // each doc's first try failed with UNAVAILABLE; the SDK tried it again, with no code of ours
    const tries = (doc: string) => txPaths.filter((path) => path.endsWith(doc)).length;
    expect([tries('voice_prosody/data'), tries('celebration_momentum/profile')]).toEqual([2, 2]);
    const after = await stored(u, ['OLD', 'HELD']);
    expect([after['voice.OLD'], after['voice.HELD'], after['mom.HELD']]).toEqual([12, 0, 0]);
    expect((await windows(u)).map((w) => w.scrubbed)).toEqual([true]);
    await endProc(p);
  }, 90_000);

  const MIRRORS = ['trust_profiles/voice_prosody', 'trust_profiles/celebration_momentum'];
  for (const hang of ['windows read', 'scrub retry'] as const)
    it(`the held ${hang} never settles: the session-end save writes neither mirror, and doesn't wait`, async () => {
      await setup();
      on();
      const u = uid(hang === 'scrub retry' ? 'S' : 'W');
      await seed(u);
      let p = await proc();
      failTx = new RegExp(`^bogle_users/${u}/`);
      txMode = 'fail';
      await heldCall(p, u); // its scrub failed: the stored window is unscrubbed
      await endProc(p);
      const docs = async () =>
        JSON.stringify(
          await Promise.all(
            [...MIRRORS, 'voice_prosody/data', 'celebration_momentum/profile'].map((d) =>
              read(`bogle_users/${u}/${d}`)
            )
          )
        );
      const before = await docs();
      if (hang === 'windows read') {
        failTx = null;
        hangRead = new RegExp(`^minor_care_holds/${u}$`);
      } else txMode = 'hang';
      p = await proc(); // the next call, on another process
      p.mc.bindSessionUser(`next-${u}`, u);
      let settled = false;
      void p.persist.loadTrustProfiles(u).finally(() => (settled = true));
      speak(p, u, 'NEW', 10, 'neutral');
      win(p, u, 'NEW');
      const ended = await Promise.race([
        endCall(p, u).then(() => 'ended'),
        sleep(10_000).then(() => 'waited'),
      ]);
      expect(ended, 'the session end did not wait on the hung read').toBe('ended');
      await sleep(3500); // past a momentum timer tick
      expect(settled, 'still hanging').toBe(false);
      expect(await docs()).toBe(before);
      await endProc(p);
    }, 90_000);

  it('the hold record, written for real: heldUntil and the windows both stay, and it never expires first', async () => {
    await setup();
    on();
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
    const u = uid('K');
    const p = await proc();
    await heldCall(p, u); // the age statement writes the hold; the purge rewrites it and stores the window
    const shared = await import('../../outreach/minor-care-shared-hold.js');
    await shared.recordSharedHold(u); // another held session's write, after the window
    const doc = await read(`minor_care_holds/${u}`);
    await endProc(p);
    expect(typeof doc?.heldUntil, 'heldUntil reached the emulator').toBe('number');
    expect(doc?.v).toBe(1);
    const stored = (doc?.windows ?? []) as Array<{ end: number; scrubbed: boolean }>;
    expect(stored.map((w) => w.scrubbed)).toEqual([true]);
    const expireAt = (doc?.expireAt as { toMillis: () => number }).toMillis();
    expect(doc?.keepUntil).toBe(stored[0].end + 90 * 24 * 60 * 60 * 1000);
    expect(expireAt).toBe(doc?.keepUntil);
    expect(expireAt).toBeGreaterThan(doc?.heldUntil as number);
  }, 90_000);
});
