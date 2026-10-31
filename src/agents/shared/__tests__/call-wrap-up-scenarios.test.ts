/**
 * #2291, the lead's verify scenarios (round 2), on the real timing: the
 * caller's final transcript comes first, then the end-of-turn wait, then the
 * turn's crisis read. Web (holds honoured), iOS today (no client handling:
 * the server owns the delete), and phone (idle end and PHONE_GOODBYE's
 * endCall). A call never ends on crisis risk or while the caller is talking,
 * and a calm goodbye still ends promptly. Same simulated call as
 * call-wrap-up-continue.test.ts.
 */
import { llm } from '@livekit/agents';
import { ParticipantKind } from '@livekit/rtc-node';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const logged = vi.hoisted(() => [] as string[]);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...actual,
    createLogger: (bindings: Record<string, unknown>) => {
      const real = actual.createLogger(bindings);
      if (bindings['module'] !== 'wrap-up-window') return real;
      return { ...real, error: (_obj: unknown, msg: string) => void logged.push(msg) };
    },
  };
});

import { PersonaVoiceAgent } from '../../personas/ferni-agent.js';
import { attachCallWrapUp, DISCONNECT_DELAY_MS, REMOVAL_GRACE_MS } from '../call-wrap-up.js';
import {
  callerSignsOff,
  clearFarewell,
  farewellSaid,
  IDLE_AFTER_GOODBYE_MS,
} from '../call-farewell.js';
import { HOLD_MAX_MS } from '../caller-activity.js';
import { CRISIS_HOLD, END_CALL } from '../phone-goodbye.js';
import { clearSessionClosing, isSessionClosing } from '../session-closing-tracker.js';
import { AFTER_END_WATCH_MS } from '../wrap-up-window.js';
import {
  initFrontendSignal,
  resetFrontendSignal,
} from '../../../services/communication/frontend-signal.js';
import {
  crisisRiskListenerCount,
  noteCrisisRisk,
  resetCrisisCallRisk,
  trackCrisisRead,
} from '../../../services/safety/crisis-call-risk.js';

const used: string[] = [];
afterEach(() => {
  used.splice(0).forEach((id) => {
    clearSessionClosing(id);
    clearFarewell(id);
  });
  resetFrontendSignal();
  resetCrisisCallRisk();
  logged.splice(0);
});

let n = 0;
const APP_MAX_HOLD_MS = 8_000;
const AFTER_END = 'CRISIS_AFTER_END crisis risk noted after the call ended';

function agent(): PersonaVoiceAgent {
  const tool = llm.tool({
    name: 'getWeather',
    description: 'weather',
    parameters: z.object({}),
    execute: async () => 'ok',
  });
  return new PersonaVoiceAgent('You are Ferni.', {
    tools: new llm.ToolContext([tool]) as unknown as llm.ToolContext,
    skipGreeting: true,
  });
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => {
      setTimeout(r, 0);
    });
  }
};

/** A read that never settles: in flight for the rest of the test. */
const inFlight = (): Promise<{ risk: string }> =>
  new Promise((resolve) => {
    void resolve;
  });

/**
 * A call as prod wires it (attachCallWrapUp with its AgentSession) on a
 * simulated clock. Events land in `events` as "<ms after the end> <what>".
 */
async function call(
  opts: { phone?: boolean; env?: Record<string, string>; appStays?: boolean } = {}
) {
  // A phone caller never leaves because of a data message; an old app may not either
  const appStays = opts.appStays ?? !!opts.phone;
  const id = `continue-${++n}`;
  used.push(id);
  let now = 0;
  let endAt = 0;
  let appConnected = true;
  let appLeavesAt: number | null = null;
  let appDelay = 0;
  let deleteGate: Promise<void> | null = null;
  const events: string[] = [];
  const timers: Array<{ fn: () => void; at: number; ms: number }> = [];
  const stamp = (what: string) => events.push(`${now - endAt} ${what}`);
  initFrontendSignal(id, async (type, data) => {
    if (!appConnected) {
      stamp(`${type} ${String(data?.reason)} (app gone)`);
      return;
    }
    stamp(`${type} ${String(data?.reason)}`);
    if (type === 'conversation_end') {
      endAt = now;
      events.splice(-1, 1, `0 ${type} ${String(data?.reason)}`);
      appDelay = Number(data?.disconnectDelay);
      appLeavesAt = appStays ? null : now + appDelay;
    } else if (type === 'conversation_hold' && appLeavesAt !== null) {
      appLeavesAt = Math.min(now + appDelay, endAt + APP_MAX_HOLD_MS);
    } else if (type === 'conversation_continue') {
      appLeavesAt = null;
    }
  });
  const session = new EventEmitter();
  const roomName = `room-${id}`;
  const a = agent();
  await attachCallWrapUp(a, {
    sessionId: id,
    room: {
      name: roomName,
      get remoteParticipants() {
        return { size: appConnected ? 1 : 0 };
      },
    },
    participant: { kind: opts.phone ? ParticipantKind.SIP : ParticipantKind.STANDARD },
    onBehalf: false,
    env: opts.env ?? { CALL_WRAP_UP: 'on', PHONE_GOODBYE: 'on' },
    session,
    hangUp: async (room) => {
      stamp('delete started');
      await deleteGate;
      stamp(`deleted ${room}`);
      appConnected = false;
    },
    setTimer: (fn, ms) => {
      const timer = { fn, at: now + ms, ms };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      const at = timers.indexOf(timer as (typeof timers)[number]);
      if (at >= 0) timers.splice(at, 1);
    },
    now: () => now,
  });
  /** Run the clock to `t` ms after the end (or absolute, before it). */
  const advance = async (by: number) => {
    const to = now + by;
    for (;;) {
      timers.sort((x, y) => x.at - y.at);
      const due = Math.min(timers[0]?.at ?? Infinity, appLeavesAt ?? Infinity);
      if (due > to) break;
      now = due;
      if (appLeavesAt === due) {
        appLeavesAt = null;
        appConnected = false;
        stamp('app left');
        session.emit('close', {}); // the session closes when the caller leaves
      } else {
        timers.shift()?.fn();
      }
      await flush();
    }
    now = to;
  };
  const say = (role: 'user' | 'assistant', text: string) =>
    session.emit('conversation_item_added', { item: { type: 'message', role, textContent: text } });
  const interim = (text: string) =>
    session.emit('user_input_transcribed', { transcript: text, isFinal: false });
  const finalWords = (text: string) =>
    session.emit('user_input_transcribed', { transcript: text, isFinal: true });
  const userState = (s: string) => session.emit('user_state_changed', { newState: s });
  const agentState = (s: string) => session.emit('agent_state_changed', { newState: s });
  const goodbyes = (ferni = 'Bye, take care.') => {
    say('user', 'okay, bye!');
    agentState('speaking');
    say('assistant', ferni);
    agentState('listening');
  };
  /** Both goodbyes, the quiet window, then `conversation_end` at t = 0. */
  const toEnd = async () => {
    goodbyes();
    await advance(IDLE_AFTER_GOODBYE_MS);
    expect(events).toEqual(['0 conversation_end idle_after_goodbye']);
    expect(isSessionClosing(id)).toBe(true);
  };
  const reopens = () => events.filter((e) => e.includes('conversation_continue'));
  const holdDelete = () => {
    let release: () => void = () => {};
    deleteGate = new Promise<void>((r) => {
      release = r;
    });
    return release;
  };
  return {
    id,
    a,
    roomName,
    events,
    timers,
    session,
    say,
    interim,
    finalWords,
    userState,
    agentState,
    goodbyes,
    toEnd,
    advance,
    reopens,
    holdDelete,
    get appConnected() {
      return appConnected;
    },
  };
}

const holds = (c: { events: string[] }) => c.events.filter((e) => e.includes('conversation_hold'));
const left = (c: { events: string[] }) => c.events.filter((e) => e.includes('app left'));
const deleted = (c: { events: string[] }) => c.events.filter((e) => e.includes('delete'));
/** A read of the caller's words, settled by hand. */
function read(id: string, words: string) {
  let finish: (v: { risk: string }) => void = () => {};
  const p = trackCrisisRead(
    id,
    words,
    new Promise<{ risk: string }>((r) => {
      finish = r;
    })
  );
  return {
    finish: async (risk = 'high') => {
      finish({ risk });
      await p;
      await flush();
    },
  };
}

describe('V(a) web: bye, then 1.5 s later a crisis line said slowly over 4 s', () => {
  it('stays open and the crisis path runs', async () => {
    const c = await call();
    await c.toEnd();
    await c.advance(1_500);
    c.userState('speaking');
    const words = "actually, I don't want to be here anymore";
    // interims every 250 ms for 4 s, with a 1 s mid-sentence pause (no interims) at 3.0-4.0 s
    for (let t = 1_750; t <= 5_500; t += 250) {
      await c.advance(250);
      if (t > 3_000 && t <= 4_000) continue;
      c.interim(words.slice(0, Math.max(3, Math.round((words.length * (t - 1_500)) / 4_000))));
    }
    c.userState('listening');
    await c.advance(200);
    c.finalWords(words);
    await flush();
    await c.advance(300); // endpointing, then the turn's crisis read starts
    const r = read(c.id, words);
    await c.advance(1_000);
    await r.finish('high');
    await c.advance(REMOVAL_GRACE_MS + HOLD_MAX_MS);
    expect(left(c)).toEqual([]);
    expect(deleted(c)).toEqual([]);
    expect(c.reopens().length).toBe(1);
    expect(isSessionClosing(c.id)).toBe(false);
  });

  it('same, but the line ends in a goodbye (a crisis farewell): only the read can save it', async () => {
    const c = await call();
    await c.toEnd();
    await c.advance(1_500);
    c.userState('speaking');
    const words = "I'm sorry for everything. goodbye";
    // Interims every 450 ms: the 500 ms hold throttle drops every other one
    for (let t = 1_950; t <= 5_550; t += 450) {
      await c.advance(450);
      c.interim("I'm sorry for everything");
    }
    c.userState('listening');
    await c.advance(200);
    c.finalWords(words);
    await flush();
    await c.advance(300); // endpointing (DEFAULT_MIN_ENDPOINTING_MS)
    const r = read(c.id, words);
    await c.advance(1_000); // DEFAULT_CRISIS_CLASSIFIER_TIMEOUT_MS
    await r.finish('high');
    await flush();
    expect(left(c)).toEqual([]);
    expect(c.reopens()).toEqual([expect.stringContaining('crisis_hold')]);
  });
});

describe('V(b) web: bye, then "thanks, you too"', () => {
  it('ends promptly (disconnectDelay + slack)', async () => {
    const c = await call();
    await c.toEnd();
    await c.advance(400);
    c.userState('speaking');
    c.interim('thanks');
    await c.advance(300);
    c.interim('thanks, you');
    await c.advance(300);
    c.interim('thanks, you too');
    c.userState('listening');
    await c.advance(200);
    c.finalWords('thanks, you too');
    c.say('user', 'thanks, you too');
    await c.advance(10_000);
    expect(c.reopens()).toEqual([]);
    expect(left(c)).toEqual([`${DISCONNECT_DELAY_MS} app left`]);
  });
  it('a partial interim "thanks, you" (not itself a sign-off) holds, but still ends within ~3.2 s', async () => {
    const c = await call();
    await c.toEnd();
    await c.advance(700);
    c.interim('thanks, you');
    await c.advance(300);
    c.finalWords('thanks, you too');
    await c.advance(10_000);
    expect(c.reopens()).toEqual([]);
    expect(left(c)).toEqual(['3200 app left']);
  });
});

describe('V(c) web: crisis at 7.9 s / 8.1 s after conversation_end while the caller talks', () => {
  for (const at of [7_900, 8_100]) {
    it(`crisis noted at ${at} ms`, async () => {
      const c = await call();
      await c.toEnd();
      for (let t = 0; t < at; t += 300) {
        c.interim('and I keep thinking that maybe');
        await c.advance(Math.min(300, at - t));
      }
      noteCrisisRisk(c.id);
      await flush();
      await c.advance(REMOVAL_GRACE_MS + HOLD_MAX_MS);
      if (at < 8_000) {
        expect(c.reopens()).toEqual([`${at} conversation_continue crisis_hold`]);
        expect(left(c)).toEqual([]);
      } else {
        expect(left(c)).toEqual(['8000 app left']);
        expect(logged).toContain(AFTER_END);
      }
    });
  }
});

describe('V(d) hold spam is bounded', () => {
  it('web: app leaves at 8 s', async () => {
    const c = await call();
    await c.toEnd();
    for (let t = 0; t < 30_000; t += 100) {
      c.interim('blah blah blah');
      await c.advance(100);
    }
    expect(left(c)).toEqual(['8000 app left']);
  });
  it('old client that ignores holds (iOS today): room deleted by grace + HOLD_MAX', async () => {
    const c = await call({ appStays: true });
    await c.toEnd();
    c.userState('speaking');
    for (let t = 0; t < 30_000; t += 100) {
      c.interim('blah blah blah');
      await c.advance(100);
    }
    expect(deleted(c)[0]).toBe(`${REMOVAL_GRACE_MS + HOLD_MAX_MS} delete started`);
  });
  it('phone: idle end held at most HOLD_MAX_MS', async () => {
    const c = await call({ phone: true });
    c.goodbyes();
    c.interim('blah'); // mid-utterance at idle
    for (let t = 0; t < 30_000; t += 100) {
      c.interim('blah blah blah');
      await c.advance(100);
    }
    expect(deleted(c).length).toBeGreaterThan(0);
  });
});

describe("V(e) PHONE_GOODBYE endCall: barge-in during Ferni's goodbye with a crisis line", () => {
  it('realistic order: final transcript, THEN endpointing, THEN the read starts', async () => {
    const c = await call({ phone: true, env: { PHONE_GOODBYE: 'on' } });
    const endCall = c.a.toolCtx.functionTools[END_CALL];
    c.userState('speaking');
    c.interim("wait, I don't"); // barge-in: playout interrupted
    const run = endCall?.execute({}, {
      ctx: { waitForPlayout: async () => undefined },
    } as never) as Promise<unknown>;
    await flush();
    for (let t = 0; t < 2_000; t += 250) {
      await c.advance(250);
      c.interim("wait, I don't want to be here");
    }
    c.userState('listening');
    c.finalWords("wait, I don't want to be here anymore");
    await c.advance(300); // endpointing: turn commits, crisis gate starts its read
    const r = read(c.id, "wait, I don't want to be here anymore");
    await c.advance(800);
    await r.finish('high');
    await c.advance(HOLD_MAX_MS);
    const result = await run;
    expect(deleted(c)).toEqual([]);
  });
  it("phone endCall: caller starts 1.5 s after Ferni's goodbye played", async () => {
    const c = await call({ phone: true, env: { PHONE_GOODBYE: 'on' } });
    const endCall = c.a.toolCtx.functionTools[END_CALL];
    const run = endCall?.execute({}, {
      ctx: { waitForPlayout: async () => undefined },
    } as never) as Promise<unknown>;
    await flush();
    await c.advance(1_500);
    c.interim("actually I don't want");
    await c.advance(2_000);
    await run;
    expect(deleted(c)).toEqual([]);
  });
  it("phone idle: caller starts 1.5 s after Ferni's goodbye (before the 4 s idle)", async () => {
    const c = await call({ phone: true });
    c.goodbyes();
    await c.advance(1_500);
    c.userState('speaking');
    for (let t = 0; t < 4_000; t += 250) {
      c.interim("actually I don't want to be here");
      await c.advance(250);
    }
    c.userState('listening');
    c.finalWords("actually I don't want to be here anymore");
    c.say('user', "actually I don't want to be here anymore");
    await c.advance(300);
    const r = read(c.id, "actually I don't want to be here anymore");
    await c.advance(1_000);
    await r.finish('high');
    await c.advance(20_000);
    expect(deleted(c)).toEqual([]);
  });
});

describe('V(f) endpointing gap on the idle paths', () => {
  it('phone idle: mid-utterance at the idle end, line ends in "bye"', async () => {
    const c = await call({ phone: true });
    c.goodbyes();
    c.interim("I won't be"); // mid-utterance as the idle end starts
    await c.advance(IDLE_AFTER_GOODBYE_MS + 1_000);
    c.finalWords("I won't be here tomorrow. Bye.");
    await c.advance(300); // endpointing; the turn's read starts now
    const r = read(c.id, "I won't be here tomorrow. Bye.");
    await c.advance(800);
    await r.finish('high');
    expect(deleted(c)).toEqual([]);
  });
  it('iOS today (no client handling, server owns the delete): same line at the 5 s grace', async () => {
    const c = await call({ appStays: true });
    await c.toEnd();
    await c.advance(3_500);
    c.userState('speaking');
    c.interim("I'm sorry for");
    await c.advance(1_700);
    c.userState('listening');
    c.finalWords("I'm sorry for everything. goodbye");
    await c.advance(300);
    const r = read(c.id, "I'm sorry for everything. goodbye");
    await c.advance(800);
    await r.finish('high');
    expect(deleted(c)).toEqual([]);
  });
});
