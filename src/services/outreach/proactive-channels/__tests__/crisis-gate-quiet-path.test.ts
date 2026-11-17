/**
 * CRISIS_QUIET_FROM_GATE, end to end (rebuilds #3150): the real reply gate (gatedReply) speaks the
 * 988 script on a call, the real hook (signalGateDecisions -> quietAfterCrisis) stores it with the
 * real writer (logCrisisSignal), and the next day's promise check-in, through the per-minute
 * scheduler handler, sends nothing. A MINOR_CARE-held caller, and a crisis about someone the caller
 * knows, get only a quietUntil time: never a crisis record, never the next call's crisis note.
 * The caller's own record is marked quiet-only: it holds outreach and never reaches a reply (the
 * crisis follow-up note), on a later turn of the call or a later call.
 * Off, the same call leaves nothing, the check-in goes, and hadCrisisWithin answers as main.
 * Firestore is in memory; Firebase Auth and the Twilio send are stubbed at the SDK edge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
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
/** A pondered follow-up for the next call's opener (only greeting-direction.ts reads it live). */
const PONDERED = 'How did the garden plot turn out?';
vi.mock('../../../../intelligence/pondering/pondering-reader.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  readPonderingForGreeting: vi.fn(async () => ({ followUp: { text: PONDERED, basis: 's1' } })),
}));

const { handleDeliverScheduledActions } =
  await import('../../../../api/scheduled-jobs/background-delivery-jobs.js');
const {
  CRISIS_QUIET_DAYS,
  crisisFromSignal,
  gateCrisisSignals,
  hadCrisisWithin,
  releaseQuietHere,
} = await import('../../../human-transfer/crisis-signals.js');
const { getCrisisHistory, hadRecentCrisis, forgetRecentCrisis, logCrisisSignal } =
  await import('../../../human-transfer/index.js');
const { buildCrisisHistoryInjection } =
  await import('../../../../agents/processors/injection-builders/better-than-human-builders.js');
const { decisionFor, gatedReply } = await import('../../../../agents/personas/crisis-gate.js');
const { ponderingForOpener } =
  await import('../../../../intelligence/pondering/pondering-opener.js');
const { unfinishedTurnHoldMs } = await import('../../../../agents/multi-agent/unfinished-turn.js');
const { resetCrisisClassifierCache } = await import('../../../safety/crisis-classifier.js');
const { detectCrisis } = await import('../../../safety/crisis-guard.js');
const { quietAfterCrisis } = await import('../../../../agents/safety/crisis-quiet-window.js');
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
// Fictional lines, written for this test: a fragment the hold waits on (it ends on "the"), then
// the caller goes on. Only the classifier reads the whole line as risk; no pattern does.
const HELD_FRAGMENT = 'do my sleeves need to be long enough to hide the';
const HELD_LINE = `${HELD_FRAGMENT} marks`;
/** The joined read: its flag, and the live classifier the hold needs (heldSession). */
const JOINED_READ = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_READ_JOINED_TURN: 'on',
};

/** What the model stand-in says when its request's last message names 988 (the crisis guidance). */
const FOLLOWS_GUIDANCE =
  "I'm right here with you. You can call or text 988 any time, day or night.";

/**
 * A live call as LiveKit hands it to the gate: the unfinished-turn hold installed, and the turn
 * committed as a conversation_item_added. The classifier stand-in reads risk in the whole line
 * only, and keeps every line it was asked about. The model stand-in follows its guidance: it says
 * 988 only when the last message of its request names 988, and "ok" otherwise.
 */
class HeldCall extends EventEmitter {
  readonly userData = { userId: UID, services: { sessionId: `session-held-${++n}` } };
  readonly history = llm.ChatContext.empty();
  readonly unfinishedTurnHoldMs = unfinishedTurnHoldMs;
  readonly reads: string[] = [];
  readonly generate = async (_prompt: string, content: string): Promise<string> => {
    const { latest } = JSON.parse(content) as { latest: string };
    this.reads.push(latest);
    return latest.includes('the marks')
      ? '{"risk":"crisis","subject":"self"}'
      : '{"risk":"none","subject":"self"}';
  };

  readonly model = async (ctx: llm.ChatContext): Promise<ReadableStream<unknown>> => {
    const last = ctx.items.at(-1) as llm.ChatMessage | undefined;
    const said = /\b988\b/.test(last?.textContent ?? '') ? FOLLOWS_GUIDANCE : 'ok';
    return new ReadableStream<unknown>({
      start(c) {
        c.enqueue(said);
        c.close();
      },
    });
  };

  commit(text: string): void {
    const item = this.history.addMessage({ role: 'user', content: text });
    this.emit('conversation_item_added', { item });
  }

  /** The preemptive request for an uncommitted final, through the real gate. */
  ask(latest: string): Promise<ReadableStream<unknown> | null> {
    return gatedReply(
      request(latest),
      this as never,
      this.model as never,
      { wrap: (s: ReadableStream<unknown>) => s } as never,
      { env: JOINED_READ, generate: this.generate as never }
    ) as Promise<ReadableStream<unknown> | null>;
  }
}

async function saidBy(reply: Promise<ReadableStream<unknown> | null>): Promise<string> {
  const out = await reply;
  let said = '';
  for await (const chunk of out as unknown as AsyncIterable<unknown>) said += String(chunk);
  return said;
}

/** A held turn: the fragment asked, then the whole line committed with no request of its own. */
async function heldTurn(): Promise<{ said: string; reads: string[] }> {
  resetCrisisClassifierCache();
  const session = new HeldCall();
  const reply = session.ask(HELD_FRAGMENT);
  await settle();
  session.commit(HELD_LINE);
  const said = await saidBy(reply);
  await settle();
  return { said, reads: session.reads };
}

/**
 * A held turn where the caller goes on, as LiveKit drives it: the fragment asked, then the whole
 * line asked and committed. `said` is the whole line's reply, the one the caller hears.
 */
async function heldTurnGoingOn(): Promise<{ said: string; reads: string[] }> {
  resetCrisisClassifierCache();
  const session = new HeldCall();
  const fragment = session.ask(HELD_FRAGMENT);
  await settle();
  const joined = session.ask(HELD_LINE);
  session.commit(HELD_LINE);
  const said = await saidBy(joined);
  await saidBy(fragment); // LiveKit drops the fragment's preemptive reply
  await settle();
  return { said, reads: session.reads };
}

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
    expect(doc).not.toHaveProperty('transcriptSnippet'); // no words, not even an empty field
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

  it('a crisis turn, then an everyday turn: the crisis note and the reply are the same off and on, this call and the next', async () => {
    /** The second turn of a call whose first turn heard the 988 script: its crisis note and reply. */
    const afterCrisis = async (flag: 'on' | 'off') => {
      docs.clear();
      seedMemberAndPromise();
      forgetRecentCrisis(UID);
      vi.setSystemTime(CALL_AT);
      vi.stubEnv('CRISIS_QUIET_FROM_GATE', flag);
      const session = call();
      const sid = session.userData.services.sessionId;
      expect(await speak(session)).toContain('988');
      await settle();
      forgetRecentCrisis(UID);
      const note = await buildCrisisHistoryInjection(UID, sid, 2);
      const reply = await speak(session, 'what should I cook tonight?');
      vi.setSystemTime(RUN_AT);
      forgetRecentCrisis(UID);
      const nextCall = await buildCrisisHistoryInjection(UID, 'session-q-next', 1);
      return { note, reply, nextCall, stored: signalDocs().length };
    };
    const off = await afterCrisis('off');
    const on = await afterCrisis('on');
    expect([off.stored, on.stored]).toEqual([0, 1]); // on, the quiet record is there
    expect(on.note).toEqual(off.note);
    expect(on.reply).toBe(off.reply);
    expect(on.nextCall).toEqual(off.nextCall);
    expect(on.note).toBeNull();

    // Not a builder that never speaks: a record from the live crisis detector does bring the note.
    forgetRecentCrisis(UID);
    await logCrisisSignal(UID, gateCrisisSignals('script'), undefined, 'session-detector');
    const detected = await buildCrisisHistoryInjection(UID, 'session-q-next', 1);
    expect(JSON.stringify(detected)).toContain('CRISIS FOLLOW-UP');
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

  // The flag's MEMORY_ONLY rows (crisis-flag-homes.ts): a crisis-guided turn (the patterns, the
  // 988 script) and a held turn (heldTurn: the joined read, crisis-read-joined-turn.ts).
  it('the held turn: no pattern reads its line, and the hold waits on its fragment', () => {
    expect(decisionFor(detectCrisis(HELD_FRAGMENT)).action).toBe('pass');
    expect(decisionFor(detectCrisis(HELD_LINE)).action).toBe('pass');
    expect(unfinishedTurnHoldMs(HELD_FRAGMENT)).toBeGreaterThan(0);
  });

  it('on a crisis-guided turn and a held turn, Ferni says what it says with the flag off', async () => {
    const turns = async () => ({ guided: await speak(call()), held: await heldTurn() });
    vi.stubEnv('CRISIS_QUIET_FROM_GATE', 'off');
    const off = await turns();
    await settle();
    expect(signalDocs()).toHaveLength(0); // off keeps nothing, so on starts from the same state
    expect(off.guided).toContain('988'); // the crisis script, not the model
    // Held: the classifier read only the whole line, once the caller went on (never the fragment)
    expect(off.held.reads).toEqual([HELD_LINE]);
    vi.stubEnv('CRISIS_QUIET_FROM_GATE', 'on');
    const on = await turns();
    expect(on.held.reads).toEqual([HELD_LINE]);
    expect({ guided: on.guided, held: on.held.said }).toEqual({
      guided: off.guided,
      held: off.held.said,
    });
    await settle(); // the records are written a tick later: let them land here, not in the next test
    expect(signalDocs()).toHaveLength(2); // one per call: the script's, and the held read's guidance
  });

  it('a held turn where the caller goes on: the caller hears the crisis-guided reply, flag off and on', async () => {
    // Only the classifier reads this line, so the gate guides the model (no 988 script); what the
    // caller hears is the model's reply to the guided request. The stand-in says 988 only when
    // the request's last message names it, so 988 here means the crisis guidance reached it last.
    vi.stubEnv('CRISIS_QUIET_FROM_GATE', 'off');
    const off = await heldTurnGoingOn();
    vi.stubEnv('CRISIS_QUIET_FROM_GATE', 'on');
    const on = await heldTurnGoingOn();
    await settle();
    expect(off.reads).toEqual([HELD_LINE]);
    expect(on.reads).toEqual([HELD_LINE]);
    expect(off.said).toBe(FOLLOWS_GUIDANCE);
    expect(on.said).toBe(off.said);
  });

  it("what it keeps holds none of the caller's words, on a guided turn and a held turn", async () => {
    const seeded = new Set(docs.keys());
    await speak(call());
    const held = await heldTurn();
    await settle();
    expect(held.reads).toEqual([HELD_LINE]);
    const kept = [...docs.entries()].filter(([path]) => !seeded.has(path));
    expect(signalDocs()).toHaveLength(2); // one wordless crisis record per call
    const text = JSON.stringify(kept).toLowerCase();
    for (const words of ['honestly', 'end my life', 'after this call', 'sleeves', 'the marks'])
      expect(text, words).not.toContain(words);
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

      // The caller's own crisis from the gate is quiet-only: it reaches neither read either
      forgetRecentCrisis(UID);
      signalGateDecisions(call(), gateOf(decisionFor(OWN as never)));
      await settle();
      expect(signalDocs()).toHaveLength(1);
      expect(await getCrisisHistory(UID)).toEqual([]);
      expect((await hadRecentCrisis(UID)).hasCrisis).toBe(false);
      expect(await hadCrisisWithin(readable(), UID)).toBe(true); // it still quiets outreach

      // A record from the live crisis detector (no source) reaches both: the reads still see one
      forgetRecentCrisis(UID);
      await logCrisisSignal(UID, gateCrisisSignals('script'), undefined, 'session-detector');
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
    // The first retry waits 5 s: nothing is tried before it, and it stores
    await vi.advanceTimersByTimeAsync(4_999);
    await settle();
    expect(signalDocs()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(signalDocs()).toHaveLength(1);
    // Stored, so this process lets go: with the doc gone nothing holds it
    docs.delete(signalDocs()[0]![0]);
    expect(await hadCrisisWithin(readable(), UID, CRISIS_QUIET_DAYS, CALL_AT)).toBe(false);
  });
});

describe('CRISIS_QUIET_FROM_GATE off or shadow', () => {
  for (const mode of ['off', 'shadow']) {
    it(`${mode}: the caller's own crisis (the 988 script) stores no crisis record and the check-in goes`, async () => {
      vi.stubEnv('CRISIS_QUIET_FROM_GATE', mode);
      expect(await speak(call())).toContain('988'); // the gate_quiet record's branch when on
      await settle();
      expect(signalDocs()).toHaveLength(0);
      expect(docs.has(HOLD)).toBe(false);
      // false: nothing stored, and no in-process hold either (it comes before the write when on)
      expect(await hadCrisisWithin(readable(), UID, CRISIS_QUIET_DAYS, CALL_AT)).toBe(false);
      await runCheckIns();
      expect(texts).toEqual([{ to: PHONE, body: CHECK_IN }]);
    });

    it(`${mode}: a crisis about someone the caller knows stores no quietUntil and the check-in goes`, async () => {
      vi.stubEnv('CRISIS_QUIET_FROM_GATE', mode);
      signalGateDecisions(call(), gateOf(decisionFor(THIRD_PARTY as never)));
      await settle();
      expect(docs.has(HOLD)).toBe(false);
      expect(signalDocs()).toHaveLength(0);
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

describe("the next call after a gate crisis: hadCrisisWithin's readers are quieter, never louder", () => {
  // With the flag on, the gate's own record (source gate_quiet) counts for hadCrisisWithin, as for
  // outreach: the pondered opener, the greeting date line, the call sheet's recentCrisis and the
  // call-remembered card hold back for CRISIS_QUIET_DAYS. They only drop content; no crisis words.
  it('a gate crisis, then the next call: no pondered ask with the flag on; with it off the ask stays', async () => {
    const opener = () =>
      ponderingForOpener(readable(), UID, { now: RUN_AT, env: { PONDERING: 'on' } });
    expect((await opener())?.text).toBe(PONDERED); // before any crisis: the ask is there

    vi.stubEnv('CRISIS_QUIET_FROM_GATE', 'off');
    expect(await speak(call())).toContain('988');
    await settle();
    expect(signalDocs()).toHaveLength(0);
    expect((await opener())?.text).toBe(PONDERED); // off: as on main

    vi.stubEnv('CRISIS_QUIET_FROM_GATE', 'on');
    expect(await speak(call())).toContain('988');
    await settle();
    const stored = signalDocs();
    expect(stored).toHaveLength(1);
    expect(stored[0]![1]).toMatchObject({ source: 'gate_quiet' });
    expect(await opener()).toBeUndefined(); // on: the pondered ask holds back

    // Only the gate's record holds it (the in-process hold let go once it was stored)
    docs.delete(stored[0]![0]);
    expect((await opener())?.text).toBe(PONDERED);
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

describe('which gate decisions start the window', () => {
  /** What one decision stored: the crisis_signals severities and the hold doc's quietUntil. */
  async function storedFor(decision: unknown) {
    quietAfterCrisis(call(), decision as never);
    await settle();
    const severities = signalDocs().map(([, d]) => (d.signals as { severity?: number }).severity);
    return { severities, quietUntil: docs.get(HOLD)?.quietUntil };
  }
  const until = CALL_AT.getTime() + CRISIS_QUIET_DAYS * DAY;

  it('the script replacing the reply: a severity 9 signal', async () => {
    expect(await storedFor({ action: 'replace' })).toEqual({
      severities: [9],
      quietUntil: undefined,
    });
  });
  it("full guidance for the caller's own crisis: a severity 7 signal", async () => {
    const stored = await storedFor(decisionFor(OWN as never));
    expect(stored).toEqual({ severities: [7], quietUntil: undefined });
  });
  it('guidance about someone else: quietUntil only, no crisis record', async () => {
    const stored = await storedFor(decisionFor(THIRD_PARTY as never));
    expect(stored).toEqual({ severities: [], quietUntil: until });
  });
  for (const [name, decision] of [
    ['soft guidance (not a crisis)', decisionFor({ ...OWN, isCrisis: false } as never)],
    ['a bare guide', { action: 'guide' }],
    ['pass', { action: 'pass' }],
    ['no decision', null],
  ] as const) {
    it(`${name}: nothing stored`, async () => {
      expect(await storedFor(decision)).toEqual({ severities: [], quietUntil: undefined });
    });
  }
});
