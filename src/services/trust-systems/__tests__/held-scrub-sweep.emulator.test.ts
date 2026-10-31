/**
 * MINOR_CARE on a Firestore emulator: a held call's scrub failed and the caller never calls again.
 * The held-scrub sweep, in another process, finds the window by its real query (unscrubbedSince),
 * scrubs what the held caller left with the purge's own registered scrubs, marks the window, and
 * only then gives the doc its TTL. A sweep that fails again leaves it unscrubbed with no TTL.
 *
 * Real firebase-admin on the emulator, the real stores with their own sync timers, the real purge
 * and the real sweep. Faults are injected into the SDK's Transaction.get. Synthetic uids only.
 * Skips without the emulator.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/app', async () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', async () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../../utils/firestore-utils.js', async () =>
  vi.importActual('../../../utils/firestore-utils.js')
);
vi.mock('../../superhuman/semantic-intelligence/index.js', () => ({
  clearSemanticIntelligenceCache: () => undefined,
}));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
// Its own emulator project: the sweep reads every hold doc, and other emulator tests leave failed
// scrubs on purpose (held-window-durable), which it would otherwise clean under them
for (const k of ['GCLOUD_PROJECT', 'GCP_PROJECT_ID', 'GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT_ID'])
  process.env[k] = 'demo-held-scrub-sweep';

type GFS = typeof import('@google-cloud/firestore');
type Snap = { exists: boolean; data: () => Record<string, unknown> | undefined };
let scanDb: { doc: (path: string) => { get: () => Promise<Snap> } };
let failTx: RegExp | null = null;

async function setup() {
  if (scanDb) return;
  const gfs = await vi.importActual<GFS>('@google-cloud/firestore');
  scanDb = new gfs.Firestore({ projectId: process.env.GCLOUD_PROJECT }) as never;
  const tx = gfs.Transaction.prototype as unknown as { get: (...a: unknown[]) => Promise<unknown> };
  const txGet = tx.get;
  tx.get = function (this: unknown, ...a: unknown[]) {
    const path = (a[0] as { path?: string })?.path;
    if (failTx && path && failTx.test(path))
      return Promise.reject(new Error('injected transaction failure'));
    return txGet.apply(this, a);
  };
}

let n = 0;
const uid = (tag: string) =>
  `HsEm${tag}${String(++n).padStart(3, '0')}${Math.random().toString(36).slice(2, 10)}`.padEnd(
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
const sleep = (ms: number) =>
  new Promise((r) => {
    setTimeout(r, ms);
  });
async function read(path: string): Promise<Record<string, unknown> | null> {
  const s = await scanDb.doc(path).get();
  return s.exists ? (s.data() ?? null) : null;
}
const heldIn = async (u: string) =>
  JSON.stringify([
    await read(`bogle_users/${u}/voice_prosody/data`),
    await read(`bogle_users/${u}/celebration_momentum/profile`),
  ]).match(/HELD/g)?.length ?? 0;

/** A held call whose purge scrub failed; the purging process then goes away. */
async function failedHeldCall(u: string) {
  const p = await proc();
  const s = `held-${u}`;
  const startedAt = Date.now();
  p.mc.bindSessionUser(s, u);
  await p.persist.loadTrustProfiles(u);
  for (let i = 0; i < 4; i++)
    p.voice.recordVoiceSample(
      u,
      { pitchMean: 150 + i, pitchRange: 20, pitchVariability: 0.3, energyMean: 0.5 } as never,
      {
        detectedEmotion: 'fear',
        conversationContext: `HELD ${i}`,
      }
    );
  p.momentum.recordWin(u, { type: 'courage_moment', description: 'HELD-win', tags: [] } as never);
  await sleep(11_500); // the stores' own timers store them
  failTx = new RegExp(`^bogle_users/${u}/`);
  expect(p.mc.heldAfter(s, "I'm 15.", { userId: u })).toBe(true);
  p.purge.purgeHeldUser(u, s, startedAt);
  await sleep(2000);
  failTx = null;
  await endProc(p);
}
const sweep = async (now: number) => {
  const p = await proc(); // another process: the web server's job, with the purge's scrubs
  const { sweepHeldScrubs } = await import('../held-scrub-sweep.js');
  const report = await sweepHeldScrubs({ now });
  await endProc(p);
  return report;
};

afterEach(() => {
  failTx = null;
  vi.unstubAllEnvs();
});

describe.skipIf(!emulator)('MINOR_CARE: the held-scrub sweep (Firestore emulator)', () => {
  it('scrubs a failed window for a caller who never calls again, then sets the TTL', async () => {
    await setup();
    vi.stubEnv('MINOR_CARE', 'on');
    const u = uid('S');
    await failedHeldCall(u);
    expect(await heldIn(u), 'precondition: the scrub failed').toBeGreaterThan(0);
    const before = await read(`minor_care_holds/${u}`);
    expect(before?.expireAt, 'no TTL while unscrubbed').toBeNull();
    const end = (before?.windows as Array<{ end: number }>)[0].end;
    expect(before?.unscrubbedSince).toBe(end);
    vi.stubEnv('MINOR_CARE', 'off'); // the web server: the sweep runs whatever its MINOR_CARE
    await sweep(Date.now()); // younger than an hour: left to its purge
    expect(await heldIn(u)).toBeGreaterThan(0);
    const report = await sweep(Date.now() + 2 * 60 * 60 * 1000);
    expect(report.scrubbed).toBeGreaterThanOrEqual(1);
    expect(await heldIn(u)).toBe(0);
    const after = await read(`minor_care_holds/${u}`);
    expect((after?.windows as Array<{ scrubbed: boolean }>).map((w) => w.scrubbed)).toEqual([true]);
    expect(after?.unscrubbedSince).toBeNull();
    expect((after?.expireAt as { toMillis: () => number }).toMillis()).toBe(end + 90 * 86_400_000);
  }, 90_000);

  it('a sweep that fails again leaves the window unscrubbed and non-expiring', async () => {
    await setup();
    vi.stubEnv('MINOR_CARE', 'on');
    const u = uid('F');
    await failedHeldCall(u);
    failTx = new RegExp(`^bogle_users/${u}/`);
    const report = await sweep(Date.now() + 2 * 60 * 60 * 1000);
    failTx = null;
    expect(report.failed).toBeGreaterThanOrEqual(1);
    expect(await heldIn(u)).toBeGreaterThan(0);
    const after = await read(`minor_care_holds/${u}`);
    expect((after?.windows as Array<{ scrubbed: boolean }>).map((w) => w.scrubbed)).toEqual([
      false,
    ]);
    expect(after?.expireAt).toBeNull();
    expect(typeof after?.unscrubbedSince).toBe('number');
  }, 90_000);

  it('an adult (no hold doc) is untouched', async () => {
    await setup();
    vi.stubEnv('MINOR_CARE', 'on');
    const u = uid('A');
    const p = await proc();
    p.mc.bindSessionUser(`adult-${u}`, u);
    await p.persist.loadTrustProfiles(u);
    p.voice.recordVoiceSample(
      u,
      { pitchMean: 150, pitchRange: 20, pitchVariability: 0.3, energyMean: 0.5 } as never,
      {
        detectedEmotion: 'neutral',
        conversationContext: 'ADULT 0',
      }
    );
    await p.voice.flushVoiceProsodyPersistence();
    await endProc(p);
    const before = JSON.stringify(await read(`bogle_users/${u}/voice_prosody/data`));
    await sweep(Date.now() + 2 * 60 * 60 * 1000);
    expect(JSON.stringify(await read(`bogle_users/${u}/voice_prosody/data`))).toBe(before);
    expect(await read(`minor_care_holds/${u}`)).toBeNull();
  }, 90_000);
});
