/**
 * CRISIS_HOLD_FOLLOWS_REPLY: replyReadHold (crisis-turn-memory.ts) reads the call's shared crisis
 * hold (utils/crisis-memory-hold.ts) once per turn, as the reply gate's reads feed it
 * (services/safety/crisis-call-risk.ts trackCrisisRead). Flag off: no hold function, as on main.
 * Every line is fictional.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetCrisisCallRisk, trackCrisisRead } from '../../../services/safety/crisis-call-risk.js';
import {
  CRISIS_READ_WAIT,
  holdForCrisis,
  noteCrisisTurnRead,
} from '../../../utils/crisis-memory-hold.js';
import { replyReadHold } from '../crisis-turn-memory.js';

const WORDS = 'the garden had a slow week and the tomatoes are late again';
const ON = { CRISIS_HOLD_FOLLOWS_REPLY: 'on' };
const WAIT = { ...CRISIS_READ_WAIT };
let n = 0;
const call = (): string => `reply-hold-unit-${++n}`;
/** The flag-on hold function for this call's turn (replyReadHold returns null only when off). */
const holdOf = (sessionId: string | undefined): (() => Promise<boolean>) => {
  const hold = replyReadHold(sessionId, WORDS, ON);
  if (!hold) throw new Error('flag on gave no hold function');
  return hold;
};
const ask = (sessionId: string | undefined): Promise<boolean> => holdOf(sessionId)();

beforeEach(() => {
  resetCrisisCallRisk();
  Object.assign(CRISIS_READ_WAIT, { startMs: 300, settleMs: 300 });
});
afterEach(() => void Object.assign(CRISIS_READ_WAIT, WAIT));

describe('replyReadHold', () => {
  it('flag off (unset or off): no hold function, the handler runs as on main', () => {
    expect(replyReadHold(call(), WORDS, {})).toBeNull();
    expect(replyReadHold(call(), WORDS, { CRISIS_HOLD_FOLLOWS_REPLY: 'off' })).toBeNull();
  });

  it('a turn whose reads came back clean: not held', async () => {
    const sessionId = call();
    noteCrisisTurnRead(sessionId, WORDS); // the pipeline's pattern read (turn-crisis.ts)
    trackCrisisRead(sessionId, WORDS, Promise.resolve({ risk: 'none' })); // the gate's read
    expect(await ask(sessionId)).toBe(false);
  });

  it("the gate's classifier read finds a crisis after the pipeline read passed: held", async () => {
    const sessionId = call();
    noteCrisisTurnRead(sessionId, WORDS);
    let finish: (v: { risk: string }) => void = () => undefined;
    trackCrisisRead(
      sessionId,
      WORDS,
      new Promise<{ risk: string }>((resolve) => {
        finish = resolve;
      })
    );
    const held = ask(sessionId);
    setTimeout(() => finish({ risk: 'crisis' }), 20);
    expect(await held).toBe(true);
  });

  it("the gate's read fails: held (fail closed)", async () => {
    const sessionId = call();
    noteCrisisTurnRead(sessionId, WORDS);
    trackCrisisRead(sessionId, WORDS, Promise.reject(new Error('classifier unavailable')));
    expect(await ask(sessionId)).toBe(true);
  });

  it("the gate's read is still pending past the wait: held (fail closed)", async () => {
    const sessionId = call();
    noteCrisisTurnRead(sessionId, WORDS);
    trackCrisisRead(
      sessionId,
      WORDS,
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

  it('asks the shared hold once per turn: a later writer of the turn gets the same answer', async () => {
    const sessionId = call();
    noteCrisisTurnRead(sessionId, WORDS);
    const hold = holdOf(sessionId);
    expect(await hold()).toBe(false);
    holdForCrisis(sessionId); // a later call-level hold is the next turn's to read
    expect(await hold()).toBe(false);
    expect(await ask(sessionId)).toBe(true);
  });
});
