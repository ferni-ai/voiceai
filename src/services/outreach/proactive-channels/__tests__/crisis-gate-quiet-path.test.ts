/**
 * CRISIS_QUIET_FROM_GATE, end to end: the real reply gate (gatedReply) speaks the 988
 * script on a call, the real hook (quietAfterCrisis) stores it with the real writer
 * (logCrisisSignal), and the next day's promise check-in, through the per-minute
 * scheduler handler, sends nothing. Off, the same call leaves nothing and the check-in
 * goes. A MINOR_CARE-held caller gets a quietUntil time, never a crisis record. A failed
 * write holds the quiet in this process until a retry stores it.
 * Firestore is in memory; Firebase Auth and the Twilio send are stubbed at the SDK edge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { setImmediate as tick } from 'node:timers/promises';
import { pathFirestore } from './path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();
const texts: Array<{ to: string; body: string }> = [];
/** Every Firestore handle the code under test gets throws while this is on. */
const down = vi.hoisted(() => ({ on: false }));
const db = () =>
  down.on
    ? {
        collection: () => {
          throw Object.assign(new Error('firestore down'), { code: 'unavailable' });
        },
        runTransaction: () => Promise.reject(new Error('firestore down')),
      }
    : pathFirestore(docs);

vi.mock('../../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => db(),
}));
vi.mock('../../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => db(),
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
const { CRISIS_QUIET_DAYS, crisisFromSignal, hadCrisisWithin } =
  await import('../../../human-transfer/crisis-signals.js');
const { decisionFor, gatedReply } = await import('../../../../agents/personas/crisis-gate.js');
const { RETRY_MS, quietLevelOf, resetCrisisQuietWindow } =
  await import('../../../../agents/safety/crisis-quiet-window.js');
const { holdSession, resetMinorCare } = await import('../../../../utils/minor-care.js');
const { signalCrisisDecision } = await import('../../../../agents/safety/crisis-gate-signal.js');

const UID = 'member-uid-1';
const PHONE = '+15555550123';
const HOUR = 3600_000;
const DAY = 24 * HOUR;
// The call: 11:00 in New York. The check-in run: two days later, same time.
const CALL_AT = new Date('2026-10-10T15:00:00Z');
const RUN_AT = new Date('2026-10-12T15:00:00Z');
const CHECK_IN = "Hey, it's Ferni. I said I'd check in about the move. How's it going?";
const SAID = 'I want to kill myself tonight';
const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const SIGNALS = `bogle_users/${UID}/crisis_signals/`;
const HOLD = `minor_care_holds/${UID}`;

let n = 0;
const call = () => ({ userData: { userId: UID, services: { sessionId: `session-q-${++n}` } } });

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
    {
      wrap: (s: ReadableStream<unknown>) => s,
    } as never,
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

/** The member, "I'll check in about the move" made on the call, and their last talk then. */
function seedMemberAndPromise(): void {
  docs.set(`bogle_users/${UID}`, {
    contactInfo: { timezone: 'America/New_York' },
    lastContact: new Date(CALL_AT.getTime() + HOUR).toISOString(),
    outreachPreferences: { channels: ['sms'] },
  });
  docs.set(`bogle_users/${UID}/ferni_commitments/p1`, {
    type: 'check_in',
    commitment: "I'll check in about the move",
    relatedTopic: 'the move',
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
  down.on = false;
  resetCrisisQuietWindow();
  resetMinorCare();
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
  it('the 988 script on a call keeps the next promise check-in from going', async () => {
    expect(await speak(call())).toContain('988');
    await settle();

    const stored = signalDocs();
    expect(stored).toHaveLength(1);
    const doc = stored[0]![1];
    expect(crisisFromSignal(UID, doc)?.escalationType).toBe('crisis_immediate');
    expect(doc.transcriptSnippet).toBeNull(); // no words
    expect(JSON.stringify(doc).toLowerCase()).not.toMatch(/kill|myself|tonight/);

    await runCheckIns();
    expect(texts).toEqual([]);

    // The same run without the stored signal sends it: the signal is what held it.
    docs.delete(stored[0]![0]);
    await runCheckIns();
    expect(texts).toEqual([{ to: PHONE, body: CHECK_IN }]);
  });

  it('full crisis guidance from the classifier holds it too; a soft check-in does not', async () => {
    signalCrisisDecision(call(), 'guide', 'classifier', { action: 'guide' }); // soft
    await settle();
    expect(signalDocs()).toHaveLength(0);

    signalCrisisDecision(call(), 'guide', 'classifier', { action: 'guide', crisis: true });
    await settle();
    const stored = signalDocs();
    expect(stored).toHaveLength(1);
    expect(crisisFromSignal(UID, stored[0]![1])?.escalationType).toBe('crisis_support');
    await runCheckIns();
    expect(texts).toEqual([]);
  });

  it('one doc per call however many turns hear the script', async () => {
    const session = call();
    await speak(session);
    await speak(session, 'I mean it, I want to die');
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
    expect(Object.keys(hold).sort()).toEqual(['expireAt', 'quietUntil']);

    await runCheckIns();
    expect(texts).toEqual([]);
    docs.delete(HOLD);
    await runCheckIns();
    expect(texts).toEqual([{ to: PHONE, body: CHECK_IN }]);
  });

  it('a failed write holds the quiet in this process until a retry stores it', async () => {
    down.on = true;
    await speak(call());
    await settle();
    expect(signalDocs()).toHaveLength(0);
    const readable = pathFirestore(docs) as never;
    expect(await hadCrisisWithin(readable, UID, CRISIS_QUIET_DAYS, CALL_AT)).toBe(true);

    down.on = false;
    await vi.advanceTimersByTimeAsync(RETRY_MS[0]!);
    await settle();
    expect(signalDocs()).toHaveLength(1);
    // Stored, so this process lets go: with the doc gone nothing holds it
    docs.delete(signalDocs()[0]![0]);
    expect(await hadCrisisWithin(readable, UID, CRISIS_QUIET_DAYS, CALL_AT)).toBe(false);
  });
});

describe('CRISIS_QUIET_FROM_GATE off or shadow', () => {
  for (const mode of ['off', 'shadow']) {
    it(`${mode}: the call stores nothing and the check-in goes`, async () => {
      vi.stubEnv('CRISIS_QUIET_FROM_GATE', mode);
      expect(await speak(call())).toContain('988');
      await settle();
      expect(signalDocs()).toHaveLength(0);
      expect(docs.has(HOLD)).toBe(false);
      await runCheckIns();
      expect(texts).toEqual([{ to: PHONE, body: CHECK_IN }]);
    });
  }
});

describe('decisionFor', () => {
  it('marks its crisis guidance so the window counts it; a script is a script', () => {
    const found = { isCrisis: true, severity: 0.1, indicators: ['hopeless'], subject: 'self' };
    expect(quietLevelOf(decisionFor(found as never))).toBe('guidance');
    expect(quietLevelOf(decisionFor({ ...found, isCrisis: false } as never))).toBeUndefined();
  });
});

describe('quietLevelOf', () => {
  it('counts the script and full crisis guidance, never a soft check-in or a pass', () => {
    expect(quietLevelOf({ action: 'replace' })).toBe('script');
    expect(quietLevelOf({ action: 'guide', crisis: true })).toBe('guidance');
    expect(quietLevelOf({ action: 'guide' })).toBeUndefined();
    expect(quietLevelOf({ action: 'pass' })).toBeUndefined();
    expect(quietLevelOf(null)).toBeUndefined();
  });
});
