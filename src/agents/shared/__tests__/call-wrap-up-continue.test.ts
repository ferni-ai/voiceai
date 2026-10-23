/**
 * #2291: a call never ends on crisis risk, or while the caller is still talking.
 * Between `conversation_end` and the room closing:
 * - crisis risk, or a final caller line that isn't a sign-off, reopens the call:
 *   the app is sent `conversation_continue`, the call is no longer closing,
 *   nothing deletes the room, and the farewell watcher can arm again;
 * - an interim transcript holds the app's hang-up (`conversation_hold`);
 *   voice activity never reopens, it only holds the room delete;
 * - once the caller has left or the room's teardown has begun, nothing reopens:
 *   late crisis risk is logged CRISIS_AFTER_END.
 * A phone call holds its room delete the same way.
 *
 * The app is simulated: it hangs up `disconnectDelay` after `conversation_end`,
 * re-arms that on `conversation_hold` (at most 8 s from the end) and cancels it
 * on `conversation_continue`, as apps/web/src/app/conversation-continue.ts does.
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

describe('crisis risk after conversation_end (#2291)', () => {
  it('reopens the call, and the grace timer then deletes nothing', async () => {
    const c = await call();
    await c.toEnd();
    await c.advance(1_500);
    noteCrisisRisk(c.id); // a crisis read of the caller's last words settles late
    await flush();
    expect(c.reopens()).toEqual(['1500 conversation_continue crisis_hold']);
    expect(isSessionClosing(c.id)).toBe(false);
    expect(farewellSaid(c.id)).toBe(false);
    await c.advance(REMOVAL_GRACE_MS + HOLD_MAX_MS);
    expect(c.events.some((e) => e.includes('delete'))).toBe(false);
    expect(c.appConnected).toBe(true);
    expect(isSessionClosing(c.id)).toBe(false);
  });

  it('the app keeps its goodbye up long enough for a ~2 s crisis read to land first', async () => {
    const c = await call();
    await c.toEnd();
    // Transcription plus up to ~1.5 s of classifier after the caller's last words
    await c.advance(2_000);
    noteCrisisRisk(c.id);
    await flush();
    expect(c.reopens()).toEqual(['2000 conversation_continue crisis_hold']);
    expect(c.appConnected).toBe(true);
    expect(DISCONNECT_DELAY_MS).toBeGreaterThan(2_000);
  });

  it('a crisis read started after the goodbye played reopens the call when it settles', async () => {
    const c = await call();
    await c.toEnd();
    let finish: (v: { risk: string }) => void = () => {};
    const read = trackCrisisRead(
      c.id,
      'i do not want to be here anymore',
      new Promise<{ risk: string }>((resolve) => {
        finish = resolve;
      })
    );
    finish({ risk: 'high' });
    await read;
    await flush();
    expect(c.reopens()).toEqual(['0 conversation_continue crisis_hold']);
    expect(isSessionClosing(c.id)).toBe(false);
  });

  it('a read still in flight at the grace holds the delete, then the hold reopens the call', async () => {
    const c = await call({ appStays: true });
    await c.toEnd();
    void trackCrisisRead(c.id, 'turn', inFlight());
    await c.advance(REMOVAL_GRACE_MS + HOLD_MAX_MS + 500);
    expect(c.reopens()).toEqual([
      `${REMOVAL_GRACE_MS + HOLD_MAX_MS} conversation_continue crisis_hold`,
    ]);
    expect(c.events.some((e) => e.includes('delete'))).toBe(false);
    expect(isSessionClosing(c.id)).toBe(false);
  });

  it('after the app left: no reopen, the call stays closed, and CRISIS_AFTER_END is logged', async () => {
    const c = await call();
    await c.toEnd();
    await c.advance(3_000); // the app left at +2.5 s
    expect(c.appConnected).toBe(false);
    noteCrisisRisk(c.id);
    await flush();
    expect(c.reopens()).toEqual([]);
    expect(isSessionClosing(c.id)).toBe(true);
    expect(logged).toEqual([AFTER_END]);

    await c.advance(REMOVAL_GRACE_MS); // the grace: the caller is gone, nothing deleted
    noteCrisisRisk(c.id);
    await flush();
    expect(logged).toEqual([AFTER_END, AFTER_END]);
    expect(c.reopens()).toEqual([]);
  });

  it('during the room delete: no reopen, closing stays, CRISIS_AFTER_END is logged', async () => {
    const c = await call({ appStays: true });
    await c.toEnd();
    const release = c.holdDelete();
    await c.advance(REMOVAL_GRACE_MS);
    expect(c.events.at(-1)).toBe(`${REMOVAL_GRACE_MS} delete started`);
    noteCrisisRisk(c.id);
    c.say('user', 'wait');
    await flush();
    expect(c.reopens()).toEqual([]);
    expect(isSessionClosing(c.id)).toBe(true);
    expect(logged).toEqual([AFTER_END]);
    release();
    await flush();
    expect(c.events.at(-1)).toBe(`${REMOVAL_GRACE_MS} deleted ${c.roomName}`);
  });
});

describe('the caller keeps talking after conversation_end (#2291)', () => {
  it('a crisis line takes ~3 s to say: interims hold the app, the line reopens the call', async () => {
    const c = await call();
    await c.toEnd();
    await c.advance(200);
    c.userState('speaking'); // "actually, I don't think I'll be here tomorrow" begins
    for (let t = 500; t <= 3_200; t += 300) {
      await c.advance(300);
      c.interim("actually, I don't think I'll be here");
    }
    expect(c.events.filter((e) => e.includes('conversation_hold'))).toEqual([
      '500 conversation_hold caller_speaking',
      '1100 conversation_hold caller_speaking',
      '1700 conversation_hold caller_speaking',
      '2300 conversation_hold caller_speaking',
      '2900 conversation_hold caller_speaking',
    ]);
    expect(c.reopens()).toEqual([]); // a hold never reopens
    expect(isSessionClosing(c.id)).toBe(true);
    await c.advance(200);
    c.finalWords("actually, I don't think I'll be here tomorrow");
    await flush();
    expect(c.appConnected).toBe(true);
    expect(c.reopens()).toEqual(['3400 conversation_continue caller_spoke']);
    expect(isSessionClosing(c.id)).toBe(false);
  });

  it('without the holds the app would have left before the line was said', async () => {
    const c = await call();
    await c.toEnd();
    c.userState('speaking');
    await c.advance(3_400);
    c.finalWords("actually, I don't think I'll be here tomorrow");
    await flush();
    expect(c.events).toContain(`${DISCONNECT_DELAY_MS} app left`);
    expect(c.reopens()).toEqual([]);
  });

  it('the app hold is capped: 8 s after the end it leaves however long the caller talks', async () => {
    const c = await call();
    await c.toEnd();
    for (let t = 0; t < 10_000; t += 400) {
      c.interim('and so then the thing is that');
      await c.advance(400);
    }
    expect(c.events).toContain(`${APP_MAX_HOLD_MS} app left`);
  });

  it('voice activity alone never reopens and sends no hold, it only holds the room delete', async () => {
    const c = await call({ appStays: true });
    await c.toEnd();
    c.userState('speaking'); // the app's goodbye sound, or iOS echo
    await c.advance(REMOVAL_GRACE_MS + 1_000);
    expect(c.events).toEqual(['0 conversation_end idle_after_goodbye']);
    expect(isSessionClosing(c.id)).toBe(true);
    c.userState('listening');
    await c.advance(300);
    expect(c.events.at(-1)).toBe(`${REMOVAL_GRACE_MS + 1_250} deleted ${c.roomName}`);
    expect(c.reopens()).toEqual([]);
  });

  it('a non-goodbye final line reopens; a sign-off does not', async () => {
    for (const line of ['bye!', 'thanks', 'thank you', 'you too', 'love you', 'same to you']) {
      const c = await call();
      await c.toEnd();
      c.say('user', line);
      c.finalWords(line);
      await flush();
      expect(c.reopens(), line).toEqual([]);
      expect(isSessionClosing(c.id), line).toBe(true);
    }
    const more = await call();
    await more.toEnd();
    more.finalWords('oh wait, one more thing');
    await flush();
    expect(more.reopens()).toEqual(['0 conversation_continue caller_spoke']);
  });

  it('an echo of the goodbye or a sign-off interim sends no hold', async () => {
    const c = await call();
    await c.toEnd();
    c.interim('bye');
    c.interim('Bye, take care');
    c.say('user', 'Bye, take care.');
    await c.advance(DISCONNECT_DELAY_MS);
    expect(c.events).toEqual(['0 conversation_end idle_after_goodbye', '2500 app left']);
  });

  it('holds are sent at most every 500 ms', async () => {
    const c = await call();
    await c.toEnd();
    c.interim('so');
    c.interim('so I');
    c.interim('so I was');
    expect(c.events.filter((e) => e.includes('conversation_hold'))).toHaveLength(1);
  });
});

describe('after a reopen (#2291)', () => {
  it('Ferni answering with a goodbye re-arms the watcher and the call ends on its own', async () => {
    const c = await call();
    await c.toEnd();
    c.say('user', "you're the best");
    await flush();
    expect(c.reopens()).toHaveLength(1);
    c.agentState('speaking');
    c.say('assistant', 'Aw, you too. Bye, take care!');
    c.agentState('listening');
    await c.advance(IDLE_AFTER_GOODBYE_MS);
    expect(c.events.filter((e) => e.includes('conversation_end'))).toHaveLength(2);
    await c.advance(DISCONNECT_DELAY_MS);
    expect(c.appConnected).toBe(false);
  });

  it('Ferni carrying on needs a fresh pair of goodbyes, which still end the call', async () => {
    const c = await call();
    await c.toEnd();
    c.say('user', 'oh wait, one more thing');
    await flush();
    c.agentState('speaking');
    c.say('assistant', 'Of course, what is it?');
    c.agentState('listening');
    await c.advance(60_000);
    expect(c.events.filter((e) => e.includes('conversation_end'))).toHaveLength(1);

    c.goodbyes();
    await c.advance(IDLE_AFTER_GOODBYE_MS + DISCONNECT_DELAY_MS);
    expect(c.events.filter((e) => e.includes('conversation_end'))).toHaveLength(2);
    expect(c.appConnected).toBe(false);
  });
});

describe('watchers (#2291)', () => {
  it('reopens at most once, and unsubscribes when it does', async () => {
    const before = crisisRiskListenerCount();
    const c = await call();
    await c.toEnd();
    expect(crisisRiskListenerCount()).toBe(before + 1);
    noteCrisisRisk(c.id);
    c.say('user', 'are you still there?');
    noteCrisisRisk(c.id);
    await flush();
    expect(c.reopens()).toEqual(['0 conversation_continue crisis_hold']);
    expect(crisisRiskListenerCount()).toBe(before);
  });

  it('after the end, the late-crisis watch is removed once AFTER_END_WATCH_MS pass', async () => {
    const before = crisisRiskListenerCount();
    const c = await call();
    await c.toEnd();
    await c.advance(REMOVAL_GRACE_MS);
    expect(crisisRiskListenerCount()).toBe(before + 1); // the CRISIS_AFTER_END watch
    await c.advance(AFTER_END_WATCH_MS);
    expect(crisisRiskListenerCount()).toBe(before);
    noteCrisisRisk(c.id);
    await flush();
    expect(logged).toEqual([]);
  });

  it('crisis risk on another call does not reopen this one', async () => {
    const c = await call();
    await c.toEnd();
    noteCrisisRisk('another-call');
    await c.advance(REMOVAL_GRACE_MS);
    expect(c.reopens()).toEqual([]);
    expect(c.appConnected).toBe(false);
  });
});

describe('phone calls hold the room delete (#2291)', () => {
  it('the idle end waits on a crisis read in flight; risk then reopens the call', async () => {
    const c = await call({ phone: true });
    let finish: (v: { risk: string }) => void = () => {};
    c.goodbyes();
    c.interim('wait I'); // mid-utterance as the idle end starts
    await c.advance(IDLE_AFTER_GOODBYE_MS + 250);
    expect(isSessionClosing(c.id)).toBe(true);
    void trackCrisisRead(
      c.id,
      'not okay',
      new Promise<{ risk: string }>((r) => {
        finish = r;
      })
    );
    c.finalWords('bye'); // done speaking; the read of their words is still in flight
    await c.advance(1_000);
    expect(c.events.some((e) => e.includes('delete'))).toBe(false);
    finish({ risk: 'high' });
    await flush();
    await c.advance(HOLD_MAX_MS);
    expect(c.events.some((e) => e.includes('delete'))).toBe(false);
    expect(c.reopens()).toEqual([]); // no app to tell
    expect(isSessionClosing(c.id)).toBe(false);
  });

  it('the idle end waits while the caller is mid-utterance, then hangs up on a goodbye', async () => {
    const c = await call({ phone: true });
    c.goodbyes();
    c.interim('okay so');
    await c.advance(IDLE_AFTER_GOODBYE_MS + 1_000);
    expect(c.events.some((e) => e.includes('delete'))).toBe(false);
    c.finalWords('okay so bye then');
    await c.advance(500);
    expect(c.events.some((e) => e.includes(`deleted ${c.roomName}`))).toBe(true);
  });

  it('a calm phone goodbye still hangs up straight away', async () => {
    const c = await call({ phone: true });
    c.goodbyes();
    await c.advance(IDLE_AFTER_GOODBYE_MS);
    expect(c.events.some((e) => e.includes(`deleted ${c.roomName}`))).toBe(true);
  });

  it("PHONE_GOODBYE's endCall waits on a crisis read and then holds the call", async () => {
    const c = await call({ phone: true, env: { PHONE_GOODBYE: 'on' } });
    const endCall = c.a.toolCtx.functionTools[END_CALL];
    let finish: (v: { risk: string }) => void = () => {};
    c.interim('I just'); // mid-utterance when the goodbye finished
    const run = endCall?.execute({}, {
      ctx: { waitForPlayout: async () => undefined },
    } as never) as Promise<unknown>;
    await flush();
    void trackCrisisRead(
      c.id,
      'cannot do this',
      new Promise<{ risk: string }>((r) => {
        finish = r;
      })
    );
    c.finalWords('I just cannot do this');
    await c.advance(1_000);
    finish({ risk: 'high' });
    await flush();
    await c.advance(HOLD_MAX_MS);
    expect(await run).toEqual(CRISIS_HOLD);
    expect(c.events.some((e) => e.includes('delete'))).toBe(false);
  });
});

describe('callerSignsOff', () => {
  it('goodbyes and goodbye pleasantries sign off; anything more does not', () => {
    for (const s of [
      'bye',
      'thanks!',
      'Thank you.',
      'you too',
      'love you',
      'same to you',
      'night',
    ]) {
      expect(callerSignsOff(s), s).toBe(true);
    }
    for (const s of ['thanks but wait', 'oh wait', 'you too?', "I don't think I'll be here"]) {
      expect(callerSignsOff(s), s).toBe(false);
    }
  });
});
