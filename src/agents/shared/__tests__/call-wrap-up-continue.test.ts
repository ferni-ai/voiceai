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
  callerSaysGoodbye,
  callerSignsOff,
  clearFarewell,
  farewellSaid,
  IDLE_AFTER_GOODBYE_MS,
} from '../call-farewell.js';
import { HOLD_MAX_MS, PHONE_QUIET_MS, TURN_READ_WAIT_MS } from '../caller-activity.js';
import { farewellRisk } from '../farewell-risk.js';
import { CRISIS_HOLD, END_CALL, STILL_TALKING } from '../phone-goodbye.js';
import { clearSessionClosing, isSessionClosing } from '../session-closing-tracker.js';
import { AFTER_END_WATCH_MS } from '../wrap-up-window.js';
import {
  initFrontendSignal,
  resetFrontendSignal,
} from '../../../services/communication/frontend-signal.js';
import {
  crisisRiskListenerCount,
  crisisRiskThisCall,
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
    // Risk beyond a goodbye in the line itself: a crisis hold before any read lands
    expect(c.reopens()).toEqual(['3400 conversation_continue crisis_hold']);
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
    c.interim('I');
    c.interim('I was');
    c.interim('I was going');
    expect(c.events.filter((e) => e.includes('conversation_hold'))).toHaveLength(1);
    await c.advance(500);
    c.interim('I was going to');
    expect(c.events.filter((e) => e.includes('conversation_hold'))).toHaveLength(2);
  });

  it("after a sign-off, the turn's crisis read starting holds the app, and the room waits for it", async () => {
    const c = await call({ appStays: true });
    await c.toEnd();
    await c.advance(4_500);
    c.finalWords('thanks, you too'); // a sign-off: no reopen
    await c.advance(300); // end of turn; the read starts
    const settle = read(c.id, 'thanks, you too');
    expect(c.events.at(-1)).toBe('4800 conversation_hold checking');
    await c.advance(1_000); // past the 5 s grace: the room waits on the read
    expect(deleted(c)).toEqual([]);
    await settle('none');
    await c.advance(250);
    expect(deleted(c)).toEqual(['6000 delete started', `6000 deleted ${c.roomName}`]); // next re-check
    expect(c.reopens()).toEqual([]);
  });

  it('after a sign-off whose read never starts, the room waits TURN_READ_WAIT_MS at most', async () => {
    const c = await call({ appStays: true });
    await c.toEnd();
    await c.advance(4_500);
    c.finalWords('okay, bye!');
    await c.advance(TURN_READ_WAIT_MS + 500);
    expect(deleted(c)[0]).toBe(`${4_500 + TURN_READ_WAIT_MS} delete started`);
  });
});

describe('a goodbye that carries risk (#2291)', () => {
  it('in the window it is recorded as crisis risk, so a later plain goodbye never ends the call', async () => {
    const c = await call();
    await c.toEnd();
    c.finalWords("I won't be here tomorrow. Bye.");
    await flush();
    expect(c.reopens()).toEqual(['0 conversation_continue crisis_hold']);
    expect(crisisRiskThisCall(c.id)).toBe(true);
    c.goodbyes(); // "okay, bye!" / "Bye, take care."
    await c.advance(60_000);
    expect(c.events.filter((e) => e.includes('conversation_end'))).toHaveLength(1);
    expect(deleted(c)).toEqual([]);
    expect(isSessionClosing(c.id)).toBe(false);
  });

  it('after a reopen, a risky goodbye is never the fresh goodbye that ends it', async () => {
    const c = await call();
    await c.toEnd();
    c.finalWords('oh wait, one more thing'); // reopens
    await flush();
    c.say('user', "I won't be here tomorrow. Bye."); // the window is closed: nothing noted
    c.agentState('speaking');
    c.say('assistant', 'Bye, take care.');
    c.agentState('listening');
    await c.advance(60_000);
    expect(c.events.filter((e) => e.includes('conversation_end'))).toHaveLength(1);
    expect(farewellSaid(c.id)).toBe(false);
  });

  it('an ask to hang up still ends the call; "hang up on life. bye" never does', async () => {
    const ask = await call();
    ask.say('user', 'okay you can hang up, bye');
    ask.agentState('speaking');
    ask.say('assistant', 'Okay, talk soon.');
    ask.agentState('listening');
    await ask.advance(IDLE_AFTER_GOODBYE_MS);
    expect(ask.events).toEqual(['0 conversation_end idle_after_goodbye']);

    const risky = await call();
    risky.say('user', "I'm going to hang up on life. bye");
    risky.agentState('speaking');
    risky.say('assistant', 'Bye, take care.');
    risky.agentState('listening');
    await risky.advance(60_000);
    expect(risky.events).toEqual([]);
  });

  it('never counts as the caller saying goodbye, even before any read notes risk', async () => {
    const c = await call();
    c.say('user', "I won't be here tomorrow. Bye.");
    c.agentState('speaking');
    c.say('assistant', 'Bye, take care.');
    c.agentState('listening');
    expect(crisisRiskThisCall(c.id)).toBe(false); // the window isn't open: nothing noted
    await c.advance(60_000);
    expect(c.events).toEqual([]); // no idle end, no conversation_end
    expect(farewellSaid(c.id)).toBe(false);
  });
});

describe('plain goodbyes are never taken for risk (#2291)', () => {
  const PLAIN = [
    'talk soon',
    'good night, sleep well',
    "bye, I'm done for today",
    'adiós',
    'gracias, adiós',
  ];

  it.each(PLAIN)(
    '"%s" in the window: no reopen, no risk recorded, the app leaves',
    async (line) => {
      const c = await call();
      await c.toEnd();
      await c.advance(400);
      c.finalWords(line);
      c.say('user', line);
      await c.advance(10_000);
      expect(c.reopens()).toEqual([]);
      expect(crisisRiskThisCall(c.id)).toBe(false);
      expect(c.events).toContain(`${DISCONNECT_DELAY_MS} app left`);
    }
  );

  it('they are sign-offs with no risk; "alright, talk soon" is still the caller saying goodbye', () => {
    for (const line of [...PLAIN, 'alright, talk soon', 'goodnight, sweet dreams']) {
      expect(farewellRisk(line), line).toBe(false);
      expect(callerSignsOff(line), line).toBe(true);
    }
    expect(callerSaysGoodbye('alright, talk soon')).toBe(true);
  });

  it('fails closed on other scripts: only whole goodbye clauses are plain', () => {
    for (const line of [
      'до свидания, я больше не хочу жить',
      'adiós, ya no quiero vivir',
      'さようなら、もう生きたくない',
      'до свидания',
      'adiós, me voy', // ASCII rest, but other-script letters in the line
      'bye я больше не хочу жить', // one clause: its other-script letters keep it from reading "bye"
    ]) {
      expect(farewellRisk(line), line).toBe(true);
      expect(callerSignsOff(line), line).toBe(false);
    }
    for (const line of ['adiós', 'gracias, adiós', 'bye 🙂', 'bye, 🙂']) {
      expect(farewellRisk(line), line).toBe(false);
      expect(callerSignsOff(line), line).toBe(true);
    }
  });

  it('only warm symbols ride along with a goodbye; any other emoji or a sad face is risk', () => {
    for (const line of ['bye 🙂', 'bye 👋', 'bye 👋🏽', 'love you ❤️', 'bye :)', 'thanks <3']) {
      expect(farewellRisk(line), line).toBe(false);
      expect(callerSignsOff(line), line).toBe(true);
    }
    for (const line of ['bye 😢', 'bye 🪢', 'bye 🔫', 'bye :(', "bye :'(", 'D: bye']) {
      expect(farewellRisk(line), line).toBe(true);
      expect(callerSignsOff(line), line).toBe(false);
    }
  });

  it('a goodbye in quotes or brackets is not a sign-off: the call stays open (the safe side)', async () => {
    for (const line of ['(bye)', '“bye”', '[bye]']) {
      expect(callerSignsOff(line), line).toBe(false);
      const c = await call();
      await c.toEnd();
      c.finalWords(line); // holds for a read (#2523); none comes, so it fails closed
      await c.advance(TURN_READ_WAIT_MS);
      expect(c.reopens(), line).toEqual([
        `${TURN_READ_WAIT_MS} conversation_continue caller_spoke`,
      ]);
      expect(c.appConnected, line).toBe(true);
      expect(isSessionClosing(c.id), line).toBe(false);
    }
  });

  it('decomposed accents read as composed; a leftover combining mark fails closed', () => {
    const nfd = (s: string) => s.normalize('NFD');
    expect(nfd('adiós')).not.toBe('adiós');
    for (const line of [nfd('adiós'), nfd('gracias, adiós')]) {
      expect(farewellRisk(line), line).toBe(false);
      expect(callerSignsOff(line), line).toBe(true);
    }
    // "más" decomposed: its accent must not vanish and leave a plain-English-looking rest
    expect(farewellRisk(nfd('adiós, ya no aguanto más'))).toBe(true);
    // a mark with no composed form ("q" + acute) is never English
    expect(farewellRisk('bye, ya no q\u0301uiero estar')).toBe(true);
  });

  it('"bye 👋" in the window: no reopen, the app leaves; "bye 😢" is a crisis hold', async () => {
    const wave = await call();
    await wave.toEnd();
    await wave.advance(400);
    wave.finalWords('bye 👋');
    await wave.advance(10_000);
    expect(wave.reopens()).toEqual([]);

    const sad = await call();
    await sad.toEnd();
    sad.finalWords('bye 😢');
    await flush();
    expect(sad.reopens()).toEqual(['0 conversation_continue crisis_hold']);
    expect(crisisRiskThisCall(sad.id)).toBe(true);
  });

  it('a decomposed "adiós" in the window: no reopen, the app leaves', async () => {
    const c = await call();
    await c.toEnd();
    await c.advance(400);
    c.finalWords('adiós'.normalize('NFD'));
    await c.advance(10_000);
    expect(c.reopens()).toEqual([]);
    expect(c.events).toContain(`${DISCONNECT_DELAY_MS} app left`);
  });

  it('"bye 🙂" in the window: no reopen, the app leaves', async () => {
    const c = await call();
    await c.toEnd();
    await c.advance(400);
    c.finalWords('bye 🙂');
    await c.advance(10_000);
    expect(c.reopens()).toEqual([]);
    expect(c.events).toContain(`${DISCONNECT_DELAY_MS} app left`);
  });

  it('"до свидания, я больше не хочу жить" in the window: a crisis hold, recorded', async () => {
    const c = await call();
    await c.toEnd();
    c.finalWords('до свидания, я больше не хочу жить');
    await flush();
    expect(c.reopens()).toEqual(['0 conversation_continue crisis_hold']);
    expect(crisisRiskThisCall(c.id)).toBe(true);
  });

  it('the risk check inside callerSignsOff is reachable: a sign-off with risk is not one', () => {
    // "I'm done for now" fits the sign-off grammar, but "done" outside the plain goodbye
    // clauses ("done for today") is risk, so only the risk check keeps it from ending the call
    expect(farewellRisk("bye, I'm done for now")).toBe(true);
    expect(callerSignsOff("bye, I'm done for now")).toBe(false);
  });

  it('"done" outside a whole goodbye clause, and "para siempre", stay risk', () => {
    for (const line of [
      "I'm done. bye",
      "I'm done with all of it, goodbye",
      "bye, I'm done",
      'adiós para siempre',
      'hang up on life. bye',
      'hang up by my neck. bye',
    ]) {
      expect(farewellRisk(line), line).toBe(true);
      expect(callerSignsOff(line), line).toBe(false);
    }
  });
});

describe('a clean sign-off only when every clause is a goodbye (#2523)', () => {
  /** A line 1 s after conversation_end, its read settling as `risk`, then Ferni's own goodbye. */
  async function lineThenFerniBye(line: string, risk: string | null) {
    const c = await call();
    await c.toEnd();
    await c.advance(1_000);
    c.finalWords(line);
    await c.advance(300);
    c.say('user', line);
    const settle = read(c.id, line);
    await c.advance(800);
    if (risk) await settle(risk);
    c.agentState('speaking');
    c.say('assistant', 'Okay. Bye, take care.');
    c.agentState('listening');
    await c.advance(30_000);
    return c;
  }

  // Unambiguous finality escalates: recorded, a crisis hold even over a clean read
  it.each([
    "talk soon. or not. doesn't matter anymore",
    "sleep tight. won't wake",
    'nothing matters. bye',
    'you can hang up. I need to go do it',
    'take care of mom for me. bye',
    'this is my last call. bye',
    "last time we'll talk, bye",
    // a hold-only word outside its benign clause is still seen by the risk check
    "I'm leaving forever. bye",
    "it's over for me. bye",
    'I want it over for good. bye',
  ])('"%s" stays open as a crisis hold, even on a clean read', async (line) => {
    const c = await lineThenFerniBye(line, 'none');
    expect(c.reopens()).toEqual(['1000 conversation_continue crisis_hold']);
    expect(crisisRiskThisCall(c.id)).toBe(true);
    expect(c.appConnected).toBe(true);
  });

  // Words that also turn up in ordinary goodbyes only hold for the read: never recorded
  it.each([
    'love you forever, bye',
    'friends for life! bye',
    "okay, it's time. bye",
    'bye! never.',
    "the game's over, bye",
    "I'm done for today. and for good",
    'talk soon. never',
    'talk soon, or not',
    "sleep well. it's over",
    'bye bye. no more',
    "hang up now. it's time",
  ])('"%s" is held for the read: a clean read ends it, risk keeps it', async (line) => {
    const clean = await call();
    await clean.toEnd();
    await clean.advance(400);
    clean.finalWords(line);
    expect(clean.events.at(-1)).toBe('400 conversation_hold checking');
    await clean.advance(300);
    const settle = read(clean.id, line);
    await clean.advance(500);
    await settle('none');
    await clean.advance(15_000);
    expect(clean.reopens()).toEqual([]);
    expect(crisisRiskThisCall(clean.id)).toBe(false);
    expect(clean.appConnected).toBe(false);

    const risky = await lineThenFerniBye(line, 'high');
    expect(risky.reopens()).toEqual(['2100 conversation_continue crisis_hold']);
    expect(risky.appConnected).toBe(true);
  });

  it.each([
    'I just wanted to say bye to someone',
    'you can hang up. I need to go do it',
    'goodbye cruel world',
    'nothing matters. bye',
    'take care of mom for me. bye',
  ])('"%s" read as none: Ferni\'s own goodbye never ends the call', async (line) => {
    const c = await lineThenFerniBye(line, 'none');
    expect(c.reopens().length).toBeGreaterThan(0);
    expect(c.events.filter((e) => e.includes('conversation_end'))).toHaveLength(1);
    expect(c.appConnected).toBe(true);
  });

  it('"thanks so much, that helped. bye": a clean read ends it, with no risk recorded', async () => {
    const c = await call();
    await c.toEnd();
    await c.advance(400);
    c.finalWords('thanks so much, that helped. bye');
    expect(c.events.at(-1)).toBe('400 conversation_hold checking'); // held for the read
    await c.advance(300);
    const settle = read(c.id, 'thanks so much, that helped. bye');
    await c.advance(500);
    await settle('none');
    await c.advance(15_000);
    expect(c.reopens()).toEqual([]);
    expect(crisisRiskThisCall(c.id)).toBe(false);
    expect(c.appConnected).toBe(false);
  });

  it('the same line: risk the read finds keeps it open; no read, or a failed one, too', async () => {
    const risky = await call();
    await risky.toEnd();
    risky.finalWords('thanks so much, that helped. bye');
    await risky.advance(300);
    const settle = read(risky.id, 'thanks so much, that helped. bye');
    await risky.advance(500);
    await settle('high');
    expect(risky.reopens()).toEqual(['800 conversation_continue crisis_hold']);

    const silent = await call(); // the read never starts: fails closed
    await silent.toEnd();
    silent.finalWords('thanks so much, that helped. bye');
    await silent.advance(TURN_READ_WAIT_MS + 1_000);
    expect(silent.reopens()).toEqual([`${TURN_READ_WAIT_MS} conversation_continue caller_spoke`]);
    expect(crisisRiskThisCall(silent.id)).toBe(false);
    expect(silent.appConnected).toBe(true);
    // its goodbye no longer counts: Ferni's own goodbye doesn't end the reopened call (Rule 2)
    silent.agentState('speaking');
    silent.say('assistant', 'Okay. Bye, take care.');
    silent.agentState('listening');
    await silent.advance(30_000);
    expect(silent.events.filter((e) => e.includes('conversation_end'))).toHaveLength(1);
    expect(silent.appConnected).toBe(true);

    const failed = await call(); // the read errors: counted as risk (crisis-call-risk.ts)
    await failed.toEnd();
    failed.finalWords('thanks so much, that helped. bye');
    await failed.advance(300);
    const broken = trackCrisisRead(failed.id, 'x', Promise.reject(new Error('timeout')));
    await broken.catch(() => undefined);
    await flush();
    expect(failed.reopens()).toEqual(['300 conversation_continue crisis_hold']);
  });

  it.each([
    'talk soon',
    'alright, talk soon',
    'good night, sleep well',
    "bye, I'm done for today",
    'adiós',
    'gracias, adiós',
    'sweet dreams',
    'bye 🙂',
    'thanks, bye!',
    'love you, night',
  ])('"%s" still ends on a clean read', async (line) => {
    const c = await call();
    await c.toEnd();
    await c.advance(400);
    c.finalWords(line);
    await c.advance(300);
    const settle = read(c.id, line);
    await c.advance(500);
    await settle('none');
    await c.advance(15_000);
    expect(c.reopens()).toEqual([]);
    expect(crisisRiskThisCall(c.id)).toBe(false);
    expect(c.appConnected).toBe(false);
  });
});

describe('after a reopen (#2291)', () => {
  it("Ferni's own goodbye never ends it; a fresh caller goodbye does (#2523)", async () => {
    const c = await call();
    await c.toEnd();
    c.say('user', "you're the best");
    await flush();
    expect(c.reopens()).toHaveLength(1);
    c.agentState('speaking');
    c.say('assistant', 'Aw, you too. Bye, take care!');
    c.agentState('listening');
    await c.advance(60_000);
    expect(c.events.filter((e) => e.includes('conversation_end'))).toHaveLength(1);
    expect(c.appConnected).toBe(true);

    // Its clean read starts first, as in onUserTurnCompleted: after a reopen the end needs it
    await trackCrisisRead(c.id, 'okay, bye!', Promise.resolve({ risk: 'none' }));
    c.say('user', 'okay, bye!'); // fresh, after Ferni's goodbye: both said, it ends
    await c.advance(IDLE_AFTER_GOODBYE_MS + DISCONNECT_DELAY_MS);
    expect(c.events.filter((e) => e.includes('conversation_end'))).toHaveLength(2);
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

    await trackCrisisRead(c.id, 'okay, bye!', Promise.resolve({ risk: 'none' })); // read clean
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
    await c.advance(300); // end of turn: the line's crisis read starts
    const settle = read(c.id, 'okay so bye then');
    await c.advance(500);
    expect(deleted(c)).toEqual([]); // not while the read is in flight
    await settle('none');
    await c.advance(250);
    expect(c.events.some((e) => e.includes(`deleted ${c.roomName}`))).toBe(true);
  });

  it('a crisis read that starts after the final line (the real order) holds the phone call', async () => {
    const c = await call({ phone: true });
    c.goodbyes();
    c.interim("I won't be");
    await c.advance(IDLE_AFTER_GOODBYE_MS + 1_000);
    c.finalWords('okay. bye.'); // a sign-off, so only the read can hold it
    await c.advance(300);
    const settle = read(c.id, 'okay. bye.');
    await c.advance(800);
    await settle('high');
    await c.advance(HOLD_MAX_MS);
    expect(deleted(c)).toEqual([]);
    expect(isSessionClosing(c.id)).toBe(false);
  });

  it('a calm phone goodbye still hangs up straight away', async () => {
    const c = await call({ phone: true });
    c.goodbyes();
    await c.advance(IDLE_AFTER_GOODBYE_MS);
    expect(c.events.some((e) => e.includes(`deleted ${c.roomName}`))).toBe(true);
  });

  it("PHONE_GOODBYE's endCall: a calm goodbye hangs up after PHONE_QUIET_MS of quiet", async () => {
    const c = await call({ phone: true, env: { PHONE_GOODBYE: 'on' } });
    const run = endCallNow(c);
    await flush();
    await c.advance(PHONE_QUIET_MS - 250);
    expect(deleted(c)).toEqual([]);
    await c.advance(250);
    expect(await run).toBe('The call has ended.');
    expect(deleted(c)).toEqual([`${PHONE_QUIET_MS} delete started`, expect.any(String)]);
  });

  it("PHONE_GOODBYE's endCall: the caller saying more keeps the call open", async () => {
    const c = await call({ phone: true, env: { PHONE_GOODBYE: 'on' } });
    const run = endCallNow(c);
    await flush();
    await c.advance(1_000);
    c.interim('oh wait, actually');
    await c.advance(250);
    expect(await run).toBe(STILL_TALKING);
    expect(deleted(c)).toEqual([]);

    const sigh = await call({ phone: true, env: { PHONE_GOODBYE: 'on' } });
    sigh.interim('wait, I'); // already talking as the goodbye finished
    expect(await endCallNow(sigh)).toBe(STILL_TALKING);
  });

  it("PHONE_GOODBYE's endCall: a sign-off's crisis read starting late still holds the call", async () => {
    const c = await call({ phone: true, env: { PHONE_GOODBYE: 'on' } });
    const run = endCallNow(c);
    await flush();
    await c.advance(500);
    c.finalWords('bye.'); // a sign-off
    await c.advance(300); // end of turn, then the read starts
    const settle = read(c.id, 'bye.');
    await c.advance(1_500);
    expect(deleted(c)).toEqual([]);
    await settle('high');
    await c.advance(250);
    expect(await run).toEqual(CRISIS_HOLD);
    expect(deleted(c)).toEqual([]);
  });
});

/** PHONE_GOODBYE's endCall, run as the tool after Ferni's goodbye has played. */
function endCallNow(c: { a: PersonaVoiceAgent }): Promise<unknown> {
  const endCall = c.a.toolCtx.functionTools[END_CALL];
  return endCall?.execute({}, {
    ctx: { waitForPlayout: async () => undefined },
  } as never) as Promise<unknown>;
}

const deleted = (c: { events: string[] }) => c.events.filter((e) => e.includes('delete'));

/** A crisis read of the caller's words, started now and settled by hand. */
function read(id: string, words: string) {
  let finish: (v: { risk: string }) => void = () => {};
  const p = trackCrisisRead(
    id,
    words,
    new Promise<{ risk: string }>((r) => {
      finish = r;
    })
  );
  return async (risk: string) => {
    finish({ risk });
    await p;
    await flush();
  };
}

describe('callerSignsOff', () => {
  it('a line with risk beyond its goodbye is never a sign-off', () => {
    for (const s of [
      "I'm going to kill myself tonight. Goodbye.",
      "I won't be here tomorrow. Bye.",
      'tell my mom I love her. bye',
      "I'm sorry for everything. goodbye",
    ]) {
      expect(callerSignsOff(s), s).toBe(false);
      expect(farewellRisk(s), s).toBe(true);
    }
    for (const s of ['okay, bye!', 'thanks, you too', 'love you, bye', 'good night']) {
      expect(farewellRisk(s), s).toBe(false);
    }
    // A whole-clause ask to hang up is not risk; any other "hang" is
    for (const s of [
      'I said hang up now. You need to hang up.',
      'please hang up',
      'okay you can hang up, bye',
      'just hang up the phone. bye',
    ]) {
      expect(farewellRisk(s), s).toBe(false);
      expect(callerSaysGoodbye(s), s).toBe(true);
    }
    for (const s of [
      "I'm going to hang myself. bye",
      "I'm going to hang up on life. bye",
      'hang up by my neck. bye',
      'hang up myself. bye',
      'hang up from the ceiling, bye',
    ]) {
      expect(farewellRisk(s), s).toBe(true);
      expect(callerSignsOff(s), s).toBe(false);
    }
    // Every clause must be a goodbye or a pleasantry, not just the last one
    for (const s of ['talk to you tomorrow about the dentist, bye', 'I need my keys. bye']) {
      expect(farewellRisk(s), s).toBe(false);
      expect(callerSignsOff(s), s).toBe(false);
    }
  });

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
