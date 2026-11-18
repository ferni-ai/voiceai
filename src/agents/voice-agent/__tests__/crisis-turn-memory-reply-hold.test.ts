/**
 * CRISIS_HOLD_FOLLOWS_REPLY: replyReadHold (crisis-turn-memory.ts) reads the call's shared crisis
 * hold (utils/crisis-memory-hold.ts) once per turn. With the reply gate live it waits for the
 * gate's own read of the turn (noteReplyGateTurn) and its escalation; the pipeline's read never
 * stands in for it. Flag off: no hold function, as on main. Every line is fictional.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetCrisisCallRisk, trackCrisisRead } from '../../../services/safety/crisis-call-risk.js';
import {
  CRISIS_READ_WAIT,
  holdForCrisis,
  noteCrisisTurnRead,
  noteReplyGateTurn,
} from '../../../utils/crisis-memory-hold.js';
import { replyReadHold } from '../crisis-turn-memory.js';

const WORDS = 'the garden had a slow week and the tomatoes are late again';
const ON = { CRISIS_HOLD_FOLLOWS_REPLY: 'on' }; // the reply gate is live by default
const GATE_SHADOW = { ...ON, CRISIS_GUARD_MODE: 'shadow' };
const WAIT = { ...CRISIS_READ_WAIT };
let n = 0;
const call = (): string => `reply-hold-unit-${++n}`;
/** The flag-on hold function for this call's turn (replyReadHold returns null only when off). */
const holdOf = (
  sessionId: string | undefined,
  env: Record<string, string> = ON
): (() => Promise<boolean>) => {
  const hold = replyReadHold(sessionId, WORDS, env);
  if (!hold) throw new Error('flag on gave no hold function');
  return hold;
};
const ask = (sessionId: string | undefined, env?: Record<string, string>): Promise<boolean> =>
  holdOf(sessionId, env)();
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** The gate's read of the turn: its classifier read (tracked) and the escalation over it. */
function gateRead(sessionId: string, verdict: Promise<{ risk: string }>): void {
  trackCrisisRead(sessionId, WORDS, verdict);
  noteReplyGateTurn(sessionId, WORDS, { escalation: verdict }, ON);
}

beforeEach(() => {
  resetCrisisCallRisk();
  Object.assign(CRISIS_READ_WAIT, { startMs: 300, settleMs: 300 });
});
afterEach(() => void Object.assign(CRISIS_READ_WAIT, WAIT));

describe('replyReadHold', () => {
  it('flag off (unset or off): no hold function, and the gate notes nothing', async () => {
    expect(replyReadHold(call(), WORDS, {})).toBeNull();
    expect(replyReadHold(call(), WORDS, { CRISIS_HOLD_FOLLOWS_REPLY: 'off' })).toBeNull();
    const sessionId = call();
    noteReplyGateTurn(sessionId, WORDS, { escalation: null }, {});
    expect(await ask(sessionId)).toBe(true); // no gate read of the turn was noted
  });

  it('the pipeline and the gate both read the turn clean: not held', async () => {
    const sessionId = call();
    noteCrisisTurnRead(sessionId, WORDS); // the pipeline's pattern read (turn-crisis.ts)
    gateRead(sessionId, Promise.resolve({ risk: 'none' }));
    expect(await ask(sessionId)).toBe(false);
  });

  it("the gate's classifier read finds a crisis after the pipeline read passed: held", async () => {
    const sessionId = call();
    noteCrisisTurnRead(sessionId, WORDS);
    let finish: (v: { risk: string }) => void = () => undefined;
    gateRead(
      sessionId,
      new Promise<{ risk: string }>((resolve) => {
        finish = resolve;
      })
    );
    const held = ask(sessionId);
    setTimeout(() => finish({ risk: 'crisis' }), 20);
    expect(await held).toBe(true);
  });

  it('the gate registers its read only after the pipeline read settled clean: held', async () => {
    const sessionId = call();
    noteCrisisTurnRead(sessionId, WORDS);
    const held = ask(sessionId); // a writer asks before the gate has read the turn
    await sleep(120);
    gateRead(sessionId, Promise.resolve({ risk: 'crisis' }));
    expect(await held).toBe(true);
  });

  it("waits for the gate's escalation itself, as when its classifier read starts later: held", async () => {
    const sessionId = call();
    let finish: () => void = () => undefined;
    const escalation = new Promise<void>((resolve) => {
      finish = resolve;
    });
    noteReplyGateTurn(sessionId, WORDS, { escalation }, ON);
    const held = ask(sessionId);
    setTimeout(() => {
      holdForCrisis(sessionId); // the gate's deferred read found risk on the call
      finish();
    }, 50);
    expect(await held).toBe(true);
  });

  it("the pipeline's read alone, no gate read within the wait: held (fail closed)", async () => {
    const sessionId = call();
    noteCrisisTurnRead(sessionId, WORDS);
    expect(await ask(sessionId)).toBe(true);
  });

  it("the gate's read fails: held (fail closed)", async () => {
    const sessionId = call();
    noteCrisisTurnRead(sessionId, WORDS);
    gateRead(sessionId, Promise.reject(new Error('classifier unavailable')));
    expect(await ask(sessionId)).toBe(true);
  });

  it("the gate's read is still pending past the wait: held (fail closed)", async () => {
    const sessionId = call();
    gateRead(
      sessionId,
      new Promise<{ risk: string }>(() => {
        // never settles
      })
    );
    expect(await ask(sessionId)).toBe(true);
  });

  it('no read of the turn ever started, or no session: held (fail closed)', async () => {
    expect(await ask(call())).toBe(true);
    expect(await ask(undefined)).toBe(true);
  });

  it("with the gate in shadow (no gate read), the pipeline's clean read counts, as today", async () => {
    const sessionId = call();
    noteCrisisTurnRead(sessionId, WORDS);
    expect(await ask(sessionId, GATE_SHADOW)).toBe(false);
  });

  it('asks the shared hold once per turn: a later writer of the turn gets the same answer', async () => {
    const sessionId = call();
    gateRead(sessionId, Promise.resolve({ risk: 'none' }));
    const hold = holdOf(sessionId);
    expect(await hold()).toBe(false);
    holdForCrisis(sessionId); // a later call-level hold is the next turn's to read
    expect(await hold()).toBe(false);
    expect(await ask(sessionId)).toBe(true);
  });
});
