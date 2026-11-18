/**
 * CRISIS_HOLD_PIPELINE_WRITERS: processTurn's cross-session reflection moment (process-turn.ts,
 * saveReflectionMoment into the profile's customData, which the periodic auto-save persists)
 * holds on the turn's crisis read. Off: saved inline, as before, crisis line and all. On: saved
 * in the background, only once the read settles clean and no hold covers the caller; a crisis
 * read, no read, a read that throws or a held caller keeps nothing, even after the auto-save
 * runs. One crisis-read wait per turn, shared with the other writers (pipeline-crisis-hold.ts).
 * The real processTurn and reflection detector run, from a fresh module graph each row (its
 * trackers carry state across turns); the analysis and the classifier reads are faked.
 * Invented lines, fictional user.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const w = vi.hoisted(() => ({
  /** The turn's own read note (turn-crisis.ts) is dropped: no read of the turn starts. */
  noRead: false,
  /** The shared wait throws instead of answering. */
  throwRead: false,
  waits: 0,
}));
vi.mock('../../../../utils/crisis-memory-hold.js', async (orig) => {
  const real = await orig<typeof import('../../../../utils/crisis-memory-hold.js')>();
  return {
    ...real,
    noteCrisisTurnRead: (sessionId: string | undefined, words: string) =>
      w.noRead ? undefined : real.noteCrisisTurnRead(sessionId, words),
    crisisTurnSettled: (...args: Parameters<typeof real.crisisTurnSettled>) => {
      w.waits++;
      if (w.throwRead) return Promise.reject(new Error('read failed'));
      return real.crisisTurnSettled(...args);
    },
  };
});

/** A moment the reflection detector keeps (joy); no risk words. */
const JOY = 'I am so happy and so proud, best day ever, we finally finished the garden shed!';
/** A crisis line the detector would also keep, as a vulnerability moment. */
const CRISIS = 'I feel so alone, nobody knows this, I want to die and I am scared of tonight.';
/** No crisis words: the risk on this turn is the classifier read's, landing late. */
const QUIET = "I've never told anyone this before, but things have been really hard lately.";
/** Past the reflection's 0.6 intensity bar. */
const STRONG = { primary: 'joy', secondary: null, intensity: 0.9, distressLevel: 0 };
const FLAG = 'CRISIS_HOLD_PIPELINE_WRITERS';
const SITE = 'reflection-moment';
let n = 0;

/** A fresh module graph: processTurn and the state it reads, none carried from another row. */
async function load() {
  vi.resetModules();
  const [turn, utils, hold, care, risk, fire] = await Promise.all([
    import('../process-turn.js'),
    import('../../__tests__/test-utils.js'),
    import('../../../../utils/crisis-memory-hold.js'),
    import('../../../../utils/minor-care.js'),
    import('../../../../services/safety/crisis-call-risk.js'),
    import('../../../../utils/safe-fire-and-forget.js'),
  ]);
  Object.assign(hold.CRISIS_READ_WAIT, { startMs: 300, settleMs: 2000 });
  return { ...turn, ...utils, ...hold, ...care, ...risk, ...fire };
}
let m: Awaited<ReturnType<typeof load>>;

interface Profile {
  userId: string;
  name: string;
  customData?: { reflectionMoments?: unknown[] };
}
type Before = (sessionId: string) => void;

const metric = (context: string) =>
  m.getFireAndForgetMetrics().byContext.find((c) => c.context === context);
const ran = (context: string): number => {
  const c = metric(context);
  return c ? c.successes + c.failures : 0;
};
const moments = (p: Profile) => p.customData?.reflectionMoments ?? [];
const sleep = (ms: number, value: string) =>
  new Promise<string>((resolve) => {
    setTimeout(resolve, ms, value);
  });

/**
 * A real processTurn on turn 3 (a periodic auto-save turn), with a profile the reflection is
 * kept on and an auto-save that snapshots what it would persist.
 */
function startTurn(said: string, before: Before = () => undefined) {
  const sessionId = `pipeline-hold-${++n}`;
  const userId = `user-${sessionId}`;
  const profile: Profile = { userId, name: 'Riley Test' };
  const saved: string[] = [];
  before(sessionId);
  const ctx = {
    userText: said,
    userData: { userId, turnCount: 3, recentTranscripts: [said] },
    services: {
      ...m.createMockServices(),
      analyze: () => m.createMockAnalysis({ emotion: STRONG }),
      communicationMirroring: { getMirroringAdvice: () => null, analyzeMessage: async () => null },
      recordResponseSignal: () => undefined,
      getPromptContext: () => ({ phase: 'building' }),
      handoffState: { currentAgent: 'ferni' },
      sessionId,
      userId,
      userProfile: profile,
      saveProfile: async () => void saved.push(JSON.stringify(profile.customData ?? {})),
    },
    persona: { id: 'ferni', name: 'Ferni' },
    turnCtx: { addMessage: () => undefined, items: [] },
    logger: { info: () => undefined, warn: () => undefined, debug: () => undefined },
  };
  return { sessionId, profile, saved, done: m.processTurn(ctx as never) };
}

/** One turn, read once the auto-save and (flag on) the held writer have run. */
async function turn(said: string, before?: Before) {
  const t = startTurn(said, before);
  const result = await t.done;
  await vi.waitFor(() => expect(ran('periodic-auto-save')).toBe(1));
  if (process.env[FLAG] === 'on') await vi.waitFor(() => expect(ran(SITE)).toBe(1));
  return { ...t, result };
}

/** The classifier reads the turn as a crisis (no pattern needed) or as clean. */
const read =
  (said: string, risk: 'crisis' | 'none'): Before =>
  (id) =>
    void m.trackCrisisRead(id, said, Promise.resolve({ risk }));
/** MINOR_CARE holds the call; its classifier read is clean. */
const heldCaller =
  (said: string): Before =>
  (id) => {
    m.holdSession(id);
    read(said, 'none')(id);
  };

/** What processTurn hands the reply: crisis read, injected context and response guidance. */
const reply = (r: Awaited<ReturnType<typeof m.processTurn>>) =>
  JSON.parse(JSON.stringify({ crisis: r.crisis, injections: r.context.injections, r: r.response }));

beforeEach(async () => {
  Object.assign(w, { noRead: false, throwRead: false, waits: 0 });
  vi.stubEnv('MINOR_CARE', 'on');
  m = await load();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('CRISIS_HOLD_PIPELINE_WRITERS off: as before', () => {
  it('a clean turn: the moment is on the profile when the turn is done, and auto-saved', async () => {
    const t = await turn(JOY, read(JOY, 'none'));
    expect(moments(t.profile)).toHaveLength(1);
    expect(t.saved[0]).toContain('reflectionMoments');
    expect(ran(SITE)).toBe(0); // inline: no background writer
  });

  it('a crisis turn: the crisis line is kept and auto-saved (what the flag removes)', async () => {
    const t = await turn(CRISIS, read(CRISIS, 'crisis'));
    expect(m.crisisMemoryHeld(t.sessionId)).toBe(true);
    expect(moments(t.profile)).toHaveLength(1);
    expect(t.saved[0]).toContain('nobody knows this');
  });
});

describe('CRISIS_HOLD_PIPELINE_WRITERS on', () => {
  beforeEach(() => vi.stubEnv(FLAG, 'on'));

  it('a clean read: the moment is kept, once the read settles', async () => {
    const t = await turn(JOY, read(JOY, 'none'));
    expect(moments(t.profile)).toHaveLength(1);
    expect(metric(SITE)?.failures).toBe(0);
  });

  it("a crisis read: the held turn's moment never reaches customData, even after the auto-save", async () => {
    const t = await turn(CRISIS, read(CRISIS, 'crisis'));
    expect(m.crisisMemoryHeld(t.sessionId)).toBe(true);
    expect(t.saved).toEqual(['{}']); // the auto-save ran and persisted no moment
    expect(t.profile.customData).toBeUndefined(); // nor is one there for a later save
  });

  it('a MINOR_CARE-held caller with a clean read: nothing kept', async () => {
    const t = await turn(JOY, heldCaller(JOY));
    expect(m.writeHeld(t.profile.userId, t.sessionId)).toBe(true);
    expect(t.saved).toEqual(['{}']);
    expect(moments(t.profile)).toEqual([]);
  });

  it('no crisis read of the turn starts: nothing kept (fail closed)', async () => {
    w.noRead = true;
    const t = await turn(JOY);
    expect(moments(t.profile)).toEqual([]);
    expect(t.saved).toEqual(['{}']);
  });

  it('the wait throws: nothing kept (fail closed)', async () => {
    w.throwRead = true;
    const t = await turn(JOY, read(JOY, 'none'));
    expect(metric(SITE)?.failures).toBe(1);
    expect(moments(t.profile)).toEqual([]);
  });

  it('the read held open: the turn is done first, the moment lands once it settles clean', async () => {
    Object.assign(m.CRISIS_READ_WAIT, { settleMs: 15_000 });
    let release: (v: { risk: string }) => void = () => undefined;
    const open = new Promise<{ risk: string }>((resolve) => {
      release = resolve;
    });
    const t = startTurn(JOY, (id) => void m.trackCrisisRead(id, JOY, open));
    const first = await Promise.race([t.done.then(() => 'turn done'), sleep(5_000, 'waiting')]);
    expect(first).toBe('turn done');
    expect(moments(t.profile)).toEqual([]);
    release({ risk: 'none' });
    await vi.waitFor(() => expect(moments(t.profile)).toHaveLength(1), { timeout: 5_000 });
  }, 30_000);

  it('a crisis read that lands after the turn is done: nothing kept, then or later', async () => {
    Object.assign(m.CRISIS_READ_WAIT, { settleMs: 15_000 });
    let release: (v: { risk: string }) => void = () => undefined;
    const open = new Promise<{ risk: string }>((resolve) => {
      release = resolve;
    });
    const t = startTurn(QUIET, (id) => void m.trackCrisisRead(id, QUIET, open));
    await t.done;
    await vi.waitFor(() => expect(ran('periodic-auto-save')).toBe(1));
    expect(m.crisisMemoryHeld(t.sessionId)).toBe(false); // not held yet: the read is open
    release({ risk: 'crisis' });
    await vi.waitFor(() => expect(ran(SITE)).toBe(1), { timeout: 5_000 });
    expect(m.crisisMemoryHeld(t.sessionId)).toBe(true);
    expect(t.saved).toEqual(['{}']);
    expect(moments(t.profile)).toEqual([]);
  }, 30_000);

  it('one crisis-read wait a turn, shared by every writer that holds on it', async () => {
    await turn(JOY, read(JOY, 'none'));
    await vi.waitFor(() => expect(ran('dynamic-memory-capture')).toBe(1));
    expect(ran('relationship-network-extraction')).toBe(1);
    expect(w.waits).toBe(1);
  });
});

describe('CRISIS_HOLD_PIPELINE_WRITERS: never lowers a crisis turn', () => {
  const turns = [
    ['crisis-guided', CRISIS, read(CRISIS, 'crisis')],
    ['held', JOY, heldCaller(JOY)],
  ] as const;

  it('on a crisis-guided turn and a held turn, processTurn hands the reply what it does with the flag off', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.42); // the same phrasing picks in both arms
    for (const [name, said, before] of turns) {
      const off = reply((await turn(said, before)).result);
      vi.stubEnv(FLAG, 'on');
      m = await load();
      const on = reply((await turn(said, before)).result);
      expect(on, name).toEqual(off);
      expect(on.crisis?.isCrisis ?? false, name).toBe(name === 'crisis-guided');
      vi.stubEnv(FLAG, 'off');
      m = await load();
    }
  });

  it('on a crisis-guided turn and a held turn, the flag on keeps no reflection moment', async () => {
    vi.stubEnv(FLAG, 'on');
    for (const [name, said, before] of turns) {
      m = await load();
      const t = await turn(said, before);
      expect(moments(t.profile), name).toEqual([]);
      expect(t.saved, name).toEqual(['{}']);
    }
  });
});
