/**
 * CRISIS_QUIET_FROM_GATE, end to end (rebuilds #3150): the real reply gate (gatedReply) speaks the
 * 988 script on a call, the real hook (signalGateDecisions -> quietAfterCrisis) stores it with the
 * real writer (logCrisisSignal), and the next day's promise check-in, through the per-minute
 * scheduler handler, sends nothing. A MINOR_CARE-held caller, and a crisis about someone the caller
 * knows, get only a quietUntil time: never a crisis record, never the next call's crisis note.
 * Off, the same call leaves nothing, the check-in goes, and hadCrisisWithin answers as main.
 * Firestore is in memory; Firebase Auth and the Twilio send are stubbed at the SDK edge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { setImmediate as tick } from 'node:timers/promises';
import { pathFirestore } from './path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();
const texts: Array<{ to: string; body: string }> = [];
/** 'down': every Firestore call throws. 'hang': every Firestore call never settles. */
const store = vi.hoisted(() => ({ mode: 'up' as 'up' | 'down' | 'hang' }));
const hanging = (): unknown =>
  new Proxy(() => undefined, {
    get: (_t, key) => (key === 'then' ? () => undefined : hanging()),
    apply: () => hanging(),
  });
const db = () => {
  if (store.mode === 'hang') return hanging();
  if (store.mode === 'down') {
    return {
      collection: () => {
        throw Object.assign(new Error('firestore down'), { code: 'unavailable' });
      },
      runTransaction: () => Promise.reject(new Error('firestore down')),
    };
  }
  return pathFirestore(docs);
};

/** While on, a later-tick callback (setImmediate) is kept here for the test to run itself. */
const later = vi.hoisted(() => ({ on: false, kept: [] as Array<() => void> }));
vi.mock('node:timers', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:timers')>();
  const schedule = real.setImmediate as (fn: unknown, ...args: unknown[]) => unknown;
  return {
    ...real,
    setImmediate: ((fn: () => void, ...args: unknown[]) =>
      later.on ? later.kept.push(fn) : schedule(fn, ...args)) as never,
  };
});

vi.mock('../../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => db(),
}));
vi.mock('../../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => db(),
}));
vi.mock('../../../trust-systems/trust-doc.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getTrustDb: () => db(),
}));
vi.mock('../../../workflows/scheduled-actions.js', () => ({
  deliverDueScheduledActions: vi.fn(async () => ({ due: 0, delivered: 0 })),
}));
vi.mock('../../../data-layer/hooks/superhuman-hooks.js', () => ({
  onCommitmentKeeperChange: vi.fn(async () => undefined),
}));
vi.mock('../../../identity/firebase-auth.js', () => ({
  getFirebaseUser: vi.fn(async () => ({ phoneNumber: PHONE })),
}));
vi.mock('../../delivery/sms-delivery.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isSMSDeliveryAvailable: () => true,
  sendSMS: vi.fn(async ({ to, body }: { to: string; body: string }) => {
    texts.push({ to, body });
    return { success: true, messageSid: 'SM1' };
  }),
}));
vi.mock('../../../llm-utils.js', () => ({ callLLM: vi.fn(async () => null) }));

const { handleDeliverScheduledActions } =
  await import('../../../../api/scheduled-jobs/background-delivery-jobs.js');
const { CRISIS_QUIET_DAYS, crisisFromSignal, hadCrisisWithin, releaseQuietHere } =
  await import('../../../human-transfer/crisis-signals.js');
const { getCrisisHistory, hadRecentCrisis, forgetRecentCrisis } =
  await import('../../../human-transfer/index.js');
const { decisionFor, gatedReply } = await import('../../../../agents/personas/crisis-gate.js');
const { RETRY_MS, quietAfterCrisis, quietLevelOf, resetQuietAfterCrisis } =
  await import('../../../../agents/safety/crisis-quiet-window.js');
const { signalGateDecisions } = await import('../../../../agents/safety/crisis-gate-signal.js');
const { holdSession, resetMinorCare } = await import('../../../../utils/minor-care.js');
const { heldFromBackgroundJobs } = await import('../../minor-care-background-read.js');
const { firestoreHoldStore, recordQuietHold } = await import('../../minor-care-shared-hold.js');
const { markHeldWindowsScrubbed, noteHeldWindow, resetHeldWindows } =
  await import('../../../trust-systems/held-window.js');

const UID = 'member-uid-quiet';
const PHONE = '+15555550142';
const HOUR = 3600_000;
const DAY = 24 * HOUR;
// The call: 12:00 in New York. The check-in run: the next day, same time.
const CALL_AT = new Date('2026-11-02T17:00:00Z');
const RUN_AT = new Date('2026-11-03T17:00:00Z');
const CHECK_IN = "Hey, it's Ferni. I said I'd check in about the garden plot. How's it going?";
// Fictional lines, written for this test
const SAID = "honestly I'm going to end my life after this call";
const SAID_AGAIN = "I mean it, I don't want to be alive tomorrow";
const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const SIGNALS = `bogle_users/${UID}/crisis_signals/`;
const HOLD = `minor_care_holds/${UID}`;
const OWN = { isCrisis: true, severity: 0.5, indicators: ['hopelessness'], subject: 'self' };
const THIRD_PARTY = { ...OWN, subject: 'third_party' };

let n = 0;
const call = () => ({ userData: { userId: UID, services: { sessionId: `session-q-${++n}` } } });
/** A gate turn whose pattern decision is `decision` and that cannot escalate. */
const gateOf = (decision: object) => ({ decision: decision as never, escalation: null });

function request(text: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'user', content: text });
  return ctx;
}
const model = vi.fn(
  async () =>
    new ReadableStream<unknown>({
      start(c) {
        c.enqueue('ok');
        c.close();
      },
    })
);

/** One caller turn through the real gate; what Ferni said. */
async function speak(session: object, text = SAID): Promise<string> {
  const out = await gatedReply(
    request(text),
    session as never,
    model as never,
    { wrap: (s: ReadableStream<unknown>) => s } as never,
    { env: PATTERNS_ONLY }
  );
  let said = '';
  for await (const chunk of out as unknown as AsyncIterable<unknown>) said += String(chunk);
  return said;
}
const settle = async (): Promise<void> => {
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 5; i++) await tick();
    await vi.dynamicImportSettled();
  }
};
const signalDocs = () => [...docs.entries()].filter(([path]) => path.startsWith(SIGNALS));
const readable = () => pathFirestore(docs) as never;

/** The member, "I'll check in about the garden plot" made on the call, and their last talk then. */
function seedMemberAndPromise(): void {
  docs.set(`bogle_users/${UID}`, {
    contactInfo: { timezone: 'America/New_York' },
    lastContact: new Date(CALL_AT.getTime() + HOUR).toISOString(),
    outreachPreferences: { channels: ['sms'] },
  });
  docs.set(`bogle_users/${UID}/ferni_commitments/p1`, {
    type: 'check_in',
    commitment: "I'll check in about the garden plot",
    relatedTopic: 'the garden plot',
    madeAt: CALL_AT.toISOString(),
    outcome: 'open',
  });
}
async function runCheckIns(): Promise<void> {
  vi.setSystemTime(RUN_AT);
  const res = { writeHead: () => res, setHeader: () => undefined, end: () => undefined };
  await handleDeliverScheduledActions(
    { url: '/api/jobs/deliver-scheduled-actions' } as never,
    res as never
  );
}

beforeEach(() => {
  docs.clear();
  texts.length = 0;
  store.mode = 'up';
  later.on = false;
  later.kept.length = 0;
  resetQuietAfterCrisis();
  resetMinorCare();
  forgetRecentCrisis(UID);
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
  vi.setSystemTime(CALL_AT);
  vi.stubEnv('LOG_HASH_SECRET', 'test-hash-secret');
  vi.stubEnv('PROACTIVE_CHANNELS', 'on');
  vi.stubEnv('PROACTIVE_CHANNELS_USERS', UID);
  vi.stubEnv('OPEN_PROMISE_TRIGGERS', 'on');
  vi.stubEnv('MINOR_CARE', 'off');
  vi.stubEnv('CRISIS_QUIET_FROM_GATE', 'on');
  seedMemberAndPromise();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('CRISIS_QUIET_FROM_GATE on', () => {
  it('the 988 script on a call keeps the next-day promise check-in from going', async () => {
    expect(await speak(call())).toContain('988');
    await settle();

    const stored = signalDocs();
    expect(stored).toHaveLength(1);
    const doc = stored[0]![1];
    expect(crisisFromSignal(UID, doc)?.escalationType).toBe('crisis_immediate');
    expect(doc.transcriptSnippet).toBeNull(); // no words
    expect(JSON.stringify(doc).toLowerCase()).not.toMatch(/end my life|call|alive/);
    expect(docs.has(HOLD)).toBe(false);

    await runCheckIns();
    expect(texts).toEqual([]);

    // The same run without the stored signal sends it: the signal is what held it.
    docs.delete(stored[0]![0]);
    await runCheckIns();
    expect(texts).toEqual([{ to: PHONE, body: CHECK_IN }]);
  });

  it("full crisis guidance for the caller's own crisis holds it too", async () => {
    signalGateDecisions(call(), gateOf(decisionFor(OWN as never)));
    await settle();
    const stored = signalDocs();
    expect(stored).toHaveLength(1);
    expect(crisisFromSignal(UID, stored[0]![1])?.escalationType).toBe('crisis_support');
    await runCheckIns();
    expect(texts).toEqual([]);
  });

  it('a soft check-in or a pass stores nothing, and the check-in goes', async () => {
    signalGateDecisions(call(), gateOf({ action: 'guide', guidance: 'soft check' }));
    signalGateDecisions(call(), gateOf({ action: 'pass' }));
    await settle();
    expect(signalDocs()).toHaveLength(0);
    expect(docs.has(HOLD)).toBe(false);
    await runCheckIns();
    expect(texts).toEqual([{ to: PHONE, body: CHECK_IN }]);
  });

  it('a classifier escalation counts once it settles', async () => {
    const replace = { action: 'replace', script: '988' };
    signalGateDecisions(call(), {
      decision: { action: 'pass' } as never,
      escalation: Promise.resolve(replace as never),
    });
    await settle();
    expect(signalDocs()).toHaveLength(1);
  });

  it('the stored tier says which script: self-harm, or suicidal ideation', async () => {
    const script = (crisisType: string) =>
      ({ action: 'replace', script: '988', kind: { crisisType, severity: 'high' } }) as never;
    quietAfterCrisis(call(), script('self_harm'));
    await settle();
    const [[, harm]] = signalDocs();
    expect(harm!.signals).toMatchObject({
      severity: 9,
      selfHarmIndicators: true,
      suicidalIdeation: false,
    });

    docs.clear();
    forgetRecentCrisis(UID);
    quietAfterCrisis(call(), script('suicidal_ideation'));
    await settle();
    const [[, ideation]] = signalDocs();
    expect(ideation!.signals).toMatchObject({
      severity: 9,
      selfHarmIndicators: false,
      suicidalIdeation: true,
    });
  });

  it('one doc per call however many turns hear the script', async () => {
    const session = call();
    await speak(session);
    await speak(session, SAID_AGAIN);
    await settle();
    expect(signalDocs()).toHaveLength(1);
  });

  it('a held caller (MINOR_CARE) gets a quietUntil time, never a crisis record', async () => {
    vi.stubEnv('MINOR_CARE', 'on');
    const session = call();
    holdSession(session.userData.services.sessionId);
    expect(await speak(session)).toContain('988');
    await settle();

    expect(signalDocs()).toHaveLength(0);
    const hold = docs.get(HOLD)!;
    expect(hold.quietUntil).toBe(CALL_AT.getTime() + CRISIS_QUIET_DAYS * DAY);
    expect(Object.keys(hold).sort()).toEqual(['expireAt', 'quietUntil']); // no words, type, session
    expect(hold.expireAt).toEqual(new Date(hold.quietUntil as number)); // the TTL waits for it

    await runCheckIns();
    expect(texts).toEqual([]);
    docs.delete(HOLD);
    await runCheckIns();
    expect(texts).toEqual([{ to: PHONE, body: CHECK_IN }]);
  });

  describe('a crisis about someone the caller knows', () => {
    it('(a) holds the next-day promise check-in with a quietUntil time only', async () => {
      const decision = decisionFor(THIRD_PARTY as never);
      expect(decision).toMatchObject({ action: 'guide', about: 'third_party' });
      signalGateDecisions(call(), gateOf(decision));
      await settle();

      expect(signalDocs()).toHaveLength(0);
      const hold = docs.get(HOLD)!;
      expect(hold.quietUntil).toBe(CALL_AT.getTime() + CRISIS_QUIET_DAYS * DAY);
      expect(Object.keys(hold).sort()).toEqual(['expireAt', 'quietUntil']);
      // A time alone never makes the caller held from background jobs
      expect(await heldFromBackgroundJobs(UID)).toBe(false);

      await runCheckIns();
      expect(texts).toEqual([]);
      docs.delete(HOLD);
      await runCheckIns();
      expect(texts).toEqual([{ to: PHONE, body: CHECK_IN }]);
    });

    it("(b) leaves the crisis history and the next call's crisis note unchanged", async () => {
      signalGateDecisions(call(), gateOf(decisionFor(THIRD_PARTY as never)));
      await settle();
      expect(docs.has(HOLD)).toBe(true);
      vi.setSystemTime(RUN_AT);
      expect(await getCrisisHistory(UID)).toEqual([]);
      expect((await hadRecentCrisis(UID)).hasCrisis).toBe(false);

      // The caller's own crisis does reach both, so the two reads can tell them apart
      forgetRecentCrisis(UID);
      signalGateDecisions(call(), gateOf(decisionFor(OWN as never)));
      await settle();
      expect(await getCrisisHistory(UID)).toHaveLength(1);
      expect((await hadRecentCrisis(UID)).hasCrisis).toBe(true);
    });
  });

  it('the quiet is held in this process before anything is awaited', async () => {
    store.mode = 'hang'; // the write never settles
    later.on = true;
    try {
      signalGateDecisions(call(), gateOf({ action: 'replace', script: '988' }));
      for (const run of later.kept.splice(0)) run(); // the hook's tick, with no await after it
      // Asked in the same synchronous step: only a hold set before any await answers true
      const asked = hadCrisisWithin(readable(), UID, CRISIS_QUIET_DAYS, CALL_AT);
      expect(await asked).toBe(true);
    } finally {
      later.on = false;
      releaseQuietHere(UID); // the hung write never releases it
    }
  });

  it('a failed write holds the quiet in this process until a retry stores it', async () => {
    store.mode = 'down';
    await speak(call());
    await settle();
    expect(signalDocs()).toHaveLength(0);
    expect(await hadCrisisWithin(readable(), UID, CRISIS_QUIET_DAYS, CALL_AT)).toBe(true);

    store.mode = 'up';
    await vi.advanceTimersByTimeAsync(RETRY_MS[0]!);
    await settle();
    expect(signalDocs()).toHaveLength(1);
    // Stored, so this process lets go: with the doc gone nothing holds it
    docs.delete(signalDocs()[0]![0]);
    expect(await hadCrisisWithin(readable(), UID, CRISIS_QUIET_DAYS, CALL_AT)).toBe(false);
  });
});

describe('CRISIS_QUIET_FROM_GATE off or shadow', () => {
  for (const mode of ['off', 'shadow']) {
    it(`${mode}: the call stores nothing and the check-in goes`, async () => {
      vi.stubEnv('CRISIS_QUIET_FROM_GATE', mode);
      expect(await speak(call())).toContain('988');
      signalGateDecisions(call(), gateOf(decisionFor(THIRD_PARTY as never)));
      await settle();
      expect(signalDocs()).toHaveLength(0);
      expect(docs.has(HOLD)).toBe(false);
      expect(await hadCrisisWithin(readable(), UID, CRISIS_QUIET_DAYS, CALL_AT)).toBe(false);
      await runCheckIns();
      expect(texts).toEqual([{ to: PHONE, body: CHECK_IN }]);
    });
  }

  it("off: hadCrisisWithin answers as main's while no quietUntil doc exists", async () => {
    vi.stubEnv('CRISIS_QUIET_FROM_GATE', 'off');
    expect(docs.has(HOLD)).toBe(false);
    // nothing stored: false
    expect(await hadCrisisWithin(readable(), UID, CRISIS_QUIET_DAYS, CALL_AT)).toBe(false);
    // a crisis-level signal (the human-transfer writer's): true
    docs.set(`${SIGNALS}s1`, { timestamp: CALL_AT.toISOString(), signals: { severity: 9 } });
    expect(await hadCrisisWithin(readable(), UID, CRISIS_QUIET_DAYS, CALL_AT)).toBe(true);
    // older than the window: false
    const old = new Date(CALL_AT.getTime() - (CRISIS_QUIET_DAYS + 1) * DAY);
    docs.set(`${SIGNALS}s1`, { timestamp: old.toISOString(), signals: { severity: 9 } });
    expect(await hadCrisisWithin(readable(), UID, CRISIS_QUIET_DAYS, CALL_AT)).toBe(false);
    // unreadable: true (fails closed)
    const broken = { collection: () => ({}) } as never;
    expect(await hadCrisisWithin(broken, UID, CRISIS_QUIET_DAYS, CALL_AT)).toBe(true);
  });
});

describe("recordQuietHold on a held caller's existing hold doc", () => {
  it('adds quietUntil and keeps heldUntil, the purge windows and keepUntil', async () => {
    const heldUntil = CALL_AT.getTime() + 6 * HOUR;
    const windows = [{ start: CALL_AT.getTime() - 2 * HOUR, end: heldUntil, scrubbed: true }];
    const keepUntil = CALL_AT.getTime() + 90 * DAY;
    docs.set(HOLD, { heldUntil, v: 1, windows, keepUntil, expireAt: new Date(keepUntil) });
    const quietUntil = CALL_AT.getTime() + CRISIS_QUIET_DAYS * DAY;

    await recordQuietHold(UID, quietUntil);

    expect(docs.get(HOLD)).toEqual({
      heldUntil,
      v: 1,
      windows,
      keepUntil,
      quietUntil,
      expireAt: new Date(keepUntil), // never before the kept windows, nor the quiet
    });
    expect(await heldFromBackgroundJobs(UID)).toBe(true); // still held: the hold was not overwritten
  });
});

describe("the hold doc's other writers never let the TTL come before a crisis quietUntil", () => {
  const quietUntil = CALL_AT.getTime() + CRISIS_QUIET_DAYS * DAY;

  it('a held call writing heldUntil (the shared-hold writer) keeps quietUntil and the TTL after it', async () => {
    docs.set(HOLD, { quietUntil, expireAt: new Date(quietUntil) });
    const heldUntil = CALL_AT.getTime() + 6 * HOUR;

    await firestoreHoldStore.write(UID, { heldUntil, v: 1 });

    expect(docs.get(HOLD)).toEqual({ heldUntil, v: 1, quietUntil, expireAt: new Date(quietUntil) });
  });

  it('the purge marking its window scrubbed (the held-window writer) sets the TTL no earlier', async () => {
    resetHeldWindows();
    // A purge 80 days back: its 90-day keep ends 10 days from now, before the 14-day quiet
    const end = CALL_AT.getTime() - 80 * DAY;
    const start = end - HOUR;
    noteHeldWindow(UID, start, end);
    docs.set(HOLD, { windows: [{ start, end, scrubbed: false }], quietUntil, expireAt: null });

    expect(await markHeldWindowsScrubbed(UID)).toBe(true);

    const hold = docs.get(HOLD)!;
    expect(hold.windows).toEqual([{ start, end, scrubbed: true }]);
    expect(hold.keepUntil).toBe(end + 90 * DAY);
    expect(hold.quietUntil).toBe(quietUntil);
    expect(hold.expireAt).toEqual(new Date(quietUntil)); // not keepUntil, which comes first
    resetHeldWindows();
  });
});

describe('quietLevelOf', () => {
  it('counts the script, own crisis guidance and third-party guidance; nothing soft', () => {
    expect(quietLevelOf(decisionFor(OWN as never))).toBe('guidance');
    expect(quietLevelOf(decisionFor(THIRD_PARTY as never))).toBe('third_party');
    expect(quietLevelOf(decisionFor({ ...OWN, isCrisis: false } as never))).toBeUndefined();
    expect(quietLevelOf({ action: 'replace' })).toBe('script');
    expect(quietLevelOf({ action: 'guide' })).toBeUndefined();
    expect(quietLevelOf({ action: 'pass' })).toBeUndefined();
    expect(quietLevelOf(null)).toBeUndefined();
  });
});
