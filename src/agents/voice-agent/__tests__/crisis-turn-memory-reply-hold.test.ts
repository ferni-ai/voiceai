/**
 * CRISIS_HOLD_FOLLOWS_REPLY: turnHold (crisis-turn-memory.ts) reads the call's shared crisis
 * hold (utils/crisis-memory-hold.ts) once per turn. With the reply gate live it waits for the
 * gate's own read of THIS caller turn (noteReplyGateTurn, under the pusher's name for the turn,
 * callerTurnNoter) and its escalation; neither the pipeline's read nor an earlier turn's read
 * stands in for it, however its words overlap. Flag off: the pipeline's read alone, as on main.
 * Every line is fictional.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetCrisisCallRisk, trackCrisisRead } from '../../../services/safety/crisis-call-risk.js';
import {
  CRISIS_READ_WAIT,
  holdForCrisis,
  callerTurnNoter,
  noteCrisisTurnRead,
  noteReplyGateTurn,
} from '../../../utils/crisis-memory-hold.js';
import type { CrisisDetection } from '../../processors/types.js';
import { turnHold } from '../crisis-turn-memory.js';

const WORDS = 'the garden had a slow week and the tomatoes are late again';
const ON = { CRISIS_HOLD_FOLLOWS_REPLY: 'on' }; // the reply gate is live by default
const GATE_SHADOW = { ...ON, CRISIS_GUARD_MODE: 'shadow' };
const WAIT = { ...CRISIS_READ_WAIT };
/** The turn pipeline read the turn clean. */
const CLEAN = { shouldOverrideLLM: false, isCrisis: false } as CrisisDetection;
let n = 0;
/** The pusher names the caller turn now being spoken (caller-turn-builder.ts). */
const nameTurn = (sessionId: string, callerTurn: string): void =>
  callerTurnNoter(sessionId, ON)?.(callerTurn);
/** The call, and the turn being asked about: the pusher names it `${sessionId}:now`. */
const call = (): string => {
  const sessionId = `reply-hold-unit-${++n}`;
  nameTurn(sessionId, `${sessionId}:now`);
  return sessionId;
};
/** The handler's context for this call's turn (turn-handler.ts), named as the pusher named it. */
const turnOf = (sessionId: string | undefined, words = WORDS) => ({
  services: { sessionId },
  userText: words,
  userData: { callerTurnKey: `${sessionId}:now` },
});
/** The flag-on hold for this call's turn, its pipeline read clean. */
const holdOf = (
  sessionId: string | undefined,
  env: Record<string, string> = ON,
  words = WORDS
): (() => Promise<boolean>) => {
  const hold = turnHold(CLEAN, turnOf(sessionId, words), env);
  if (!hold.waits) throw new Error('flag on gave a hold that does not wait');
  return hold;
};
const ask = (sessionId: string | undefined, env?: Record<string, string>): Promise<boolean> =>
  holdOf(sessionId, env)();
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** The gate's read of the turn: its classifier read (tracked) and the escalation over it. */
function gateRead(sessionId: string, verdict: Promise<{ risk: string }>, words = WORDS): void {
  trackCrisisRead(sessionId, words, verdict);
  noteReplyGateTurn(sessionId, words, { escalation: verdict }, ON);
}

beforeEach(() => {
  resetCrisisCallRisk();
  Object.assign(CRISIS_READ_WAIT, { startMs: 300, settleMs: 300 });
});
afterEach(() => void Object.assign(CRISIS_READ_WAIT, WAIT));

/**
 * The lane-28 shapes (#4090): an EARLIER caller turn of the call was read clean by the gate,
 * then this turn's gate read lands only after the writers ask (and finds a crisis). On the old
 * head the earlier read's words matched this turn's by substring, so it stood in for this turn's
 * read and every writer kept the turn. Now only this turn's own read counts: held.
 */
describe('turnHold: an earlier turn never stands in for this turn', () => {
  const NOW = "no i don't know, it took a while, thank you lol honestly nothing feels worth it";
  const fillers = (k: number) => Array.from({ length: k }, (_, i) => `the bus ran late again ${i}`);
  it.each([
    ['no', ['no']],
    ['ok inside took', ['ok']],
    ["i don't know", ["i don't know"]],
    ['thank you', ['thank you']],
    ['earlier contains now', [`${NOW} and the cat agrees`]],
    ['now contains earlier', ['honestly']],
    ['an exact repeat', [NOW]],
    ["'no' 15 turns back", ['no', ...fillers(14)]],
    ["'no' 16 turns back", ['no', ...fillers(15)]],
    ['an unrelated earlier turn (control)', ['the garden is fine']],
  ])('%s: held until this turn is read, then held by its crisis', async (_shape, earlier) => {
    const sessionId = `reply-hold-unit-${++n}`;
    earlier.forEach((said, i) => {
      nameTurn(sessionId, `${sessionId}:${i}`);
      gateRead(sessionId, Promise.resolve({ risk: 'none' }), said);
    });
    await sleep(0);
    nameTurn(sessionId, `${sessionId}:now`);
    const held = holdOf(sessionId, ON, NOW)(); // a writer asks before the gate reads this turn
    await sleep(150);
    let finish: () => void = () => undefined;
    const escalation = new Promise<void>((resolve) => {
      finish = resolve;
    });
    noteReplyGateTurn(sessionId, NOW, { escalation }, ON);
    setTimeout(() => {
      holdForCrisis(sessionId); // this turn's own gate read found a crisis, two polls later
      finish();
    }, 250);
    expect(await held).toBe(true);
  });

  it("a fragment of this same turn (a preflight read) does not stand in for the turn's words", async () => {
    const sessionId = call();
    gateRead(sessionId, Promise.resolve({ risk: 'none' }), 'the garden had a slow week');
    const held = ask(sessionId);
    await sleep(150);
    gateRead(
      sessionId,
      Promise.resolve({ risk: 'crisis' }).then((v) => {
        holdForCrisis(sessionId);
        return v;
      })
    );
    expect(await held).toBe(true);
  });

  it('this turn read clean after an overlapping earlier turn: not held (the hold still lets turns record)', async () => {
    const sessionId = `reply-hold-unit-${++n}`;
    nameTurn(sessionId, `${sessionId}:0`);
    gateRead(sessionId, Promise.resolve({ risk: 'none' }), 'no');
    nameTurn(sessionId, `${sessionId}:now`);
    const kept = ask(sessionId);
    await sleep(150);
    gateRead(sessionId, Promise.resolve({ risk: 'none' }));
    expect(await kept).toBe(false);
  });
});

describe('turnHold', () => {
  it("flag off (unset or off): the pipeline's read alone, and the gate notes nothing", async () => {
    for (const env of [{}, { CRISIS_HOLD_FOLLOWS_REPLY: 'off' }]) {
      const clean = turnHold(CLEAN, turnOf(call()), env);
      expect([clean.waits, clean.read, await clean()]).toEqual([false, false, false]);
      expect(await turnHold({ ...CLEAN, isCrisis: true }, turnOf(call()), env)()).toBe(true);
    }
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

  it('the pusher named no turn: the gate read counts for none, and a turn with no name is held', async () => {
    const unnamed = `reply-hold-unit-${++n}`; // no turn was ever named for this call
    gateRead(unnamed, Promise.resolve({ risk: 'none' }));
    expect(await ask(unnamed)).toBe(true);
    const unnamedTurn = { services: { sessionId: unnamed }, userText: WORDS, userData: {} };
    expect(await turnHold(CLEAN, unnamedTurn, ON)()).toBe(true); // no name on either side
    const sessionId = call();
    gateRead(sessionId, Promise.resolve({ risk: 'none' }));
    const nameless = { services: { sessionId }, userText: WORDS, userData: {} };
    expect(await turnHold(CLEAN, nameless, ON)()).toBe(true);
    expect(await ask(sessionId)).toBe(false); // the same read, asked by its own named turn
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
