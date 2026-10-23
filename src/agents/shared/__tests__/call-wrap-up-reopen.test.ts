/**
 * #2291 / #2523, after a reopen. The reopening line's own transcript arrives
 * after its STT final reopened the call; it is never the fresh goodbye that
 * ends it, and Ferni's goodbye from before the reopen no longer counts. A
 * reopened call that goes quiet gets one warm check-in, then the usual idle
 * end (reopen-idle.ts).
 *
 * The harness is call-wrap-up-continue.test.ts's: a simulated app and clock.
 */
import { llm } from '@livekit/agents';
import { ParticipantKind } from '@livekit/rtc-node';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const checkIns = vi.hoisted(() => [] as string[]);
vi.mock('../../../speech/direction/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../speech/direction/index.js')>()),
  cueSay: (_id: string, cue: { moment: string }) => void checkIns.push(cue.moment),
}));

import { PersonaVoiceAgent } from '../../personas/ferni-agent.js';
import { attachCallWrapUp, DISCONNECT_DELAY_MS } from '../call-wrap-up.js';
import { clearFarewell, IDLE_AFTER_GOODBYE_MS } from '../call-farewell.js';
import { TURN_READ_WAIT_MS } from '../caller-activity.js';
import { REOPEN_CHECK_IN_MS, REOPEN_IDLE_END_MS } from '../reopen-idle.js';
import { clearSessionClosing, isSessionClosing } from '../session-closing-tracker.js';
import {
  initFrontendSignal,
  resetFrontendSignal,
} from '../../../services/communication/frontend-signal.js';
import {
  crisisRiskThisCall,
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
  checkIns.splice(0);
});

let n = 0;
const APP_MAX_HOLD_MS = 8_000;

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

/**
 * A call as prod wires it (attachCallWrapUp with its AgentSession) on a
 * simulated clock. Events land in `events` as "<ms after the end> <what>".
 */
async function call(
  opts: { phone?: boolean; env?: Record<string, string>; appStays?: boolean } = {}
) {
  // A phone caller never leaves because of a data message; an old app may not either
  const appStays = opts.appStays ?? !!opts.phone;
  const id = `reopen-${++n}`;
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

type Call = Awaited<ReturnType<typeof call>>;
const ends = (c: Call) => c.events.filter((e) => e.includes('conversation_end'));

/** Ferni's reply, played out. */
const ferniSays = async (c: Call, text: string) => {
  c.agentState('speaking');
  c.say('assistant', text);
  c.agentState('listening');
  await flush();
};

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

/**
 * The lead's verify of #2532 round 1: each line's STT final reopened the call,
 * then its conversation item (300 ms later, after `closing` had cleared) was
 * taken for a fresh caller goodbye, and Ferni's goodbye from before the reopen
 * ended the call about 4 s later.
 */
const REOPENING = [
  'goodbye cruel world. I gotta go',
  'see you on the other side. gotta go',
  "I can't anymore. I'm off",
  'thanks for nothing. signing off',
  "it's time. I gotta go",
  'no more. gotta go',
  'never. I gotta go',
];

/** The real order: the STT final, then (300 ms later) the conversation item. */
async function lineAfterEnd(c: Call, line: string, readAs: 'no read' | 'none') {
  await c.toEnd();
  await c.advance(1_000);
  c.finalWords(line);
  await c.advance(300);
  c.say('user', line);
  if (readAs === 'none') {
    const settle = read(c.id, line);
    await c.advance(800);
    await settle('none');
  }
}

describe('the reopening line is never the fresh goodbye (#2532)', () => {
  describe.each(['no read', 'none'] as const)('read: %s', (readAs) => {
    it.each(REOPENING)(
      '"%s": the call stays open, with or without Ferni\'s reply',
      async (line) => {
        for (const ferniReplies of [false, true]) {
          const c = await call();
          await lineAfterEnd(c, line, readAs);
          expect(c.reopens()).toHaveLength(1);
          if (ferniReplies) await ferniSays(c, 'Okay, take care of yourself.');
          await c.advance(REOPEN_CHECK_IN_MS + 10_000);
          expect(ends(c)).toHaveLength(1);
          expect(c.appConnected).toBe(true);
          expect(isSessionClosing(c.id)).toBe(false);
        }
      }
    );
  });

  it('the item before the STT final (the other order): the line is not a goodbye either', async () => {
    for (const line of REOPENING) {
      const c = await call();
      await c.toEnd();
      await c.advance(1_000);
      c.say('user', line);
      c.finalWords(line);
      await c.advance(TURN_READ_WAIT_MS);
      expect(c.reopens()).toHaveLength(1);
      await ferniSays(c, 'Okay, take care of yourself.');
      await c.advance(30_000);
      expect(ends(c)).toHaveLength(1);
      expect(c.appConnected).toBe(true);
    }
  });

  it("a fresh caller goodbye after it, with Ferni's, still ends the call", async () => {
    const c = await call();
    await lineAfterEnd(c, 'never. I gotta go', 'none');
    await ferniSays(c, 'Hey, before you go, are you okay?');
    await c.advance(3_000);
    c.finalWords("yeah, I'm fine. okay, bye!");
    c.say('user', "yeah, I'm fine. okay, bye!");
    await ferniSays(c, 'Okay. Bye, take care.');
    await c.advance(IDLE_AFTER_GOODBYE_MS + DISCONNECT_DELAY_MS);
    expect(ends(c)).toHaveLength(2);
    expect(c.appConnected).toBe(false);
  });
});

describe("Ferni's goodbye from before a reopen no longer counts (#2532)", () => {
  it('a fresh caller goodbye before Ferni replies waits for his new goodbye', async () => {
    const c = await call();
    await lineAfterEnd(c, 'oh wait, one more thing', 'no read');
    c.finalWords('actually never mind. okay, bye!');
    c.say('user', 'actually never mind. okay, bye!');
    await c.advance(IDLE_AFTER_GOODBYE_MS + DISCONNECT_DELAY_MS);
    expect(ends(c)).toHaveLength(1);
    expect(c.appConnected).toBe(true);

    await ferniSays(c, 'Ha, okay. Bye, take care!');
    await c.advance(IDLE_AFTER_GOODBYE_MS + DISCONNECT_DELAY_MS);
    expect(ends(c)).toHaveLength(2);
    expect(c.appConnected).toBe(false);
  });

  it('nor does an ask to hang up from before it', async () => {
    const c = await call();
    c.agentState('listening');
    c.say('user', 'okay bye, you can hang up now'); // ends the call whatever Ferni says
    await c.advance(IDLE_AFTER_GOODBYE_MS);
    expect(ends(c)).toHaveLength(1);
    await c.advance(1_000);
    c.finalWords('oh wait, one more thing');
    await c.advance(300);
    c.say('user', 'oh wait, one more thing');
    c.finalWords('okay, bye');
    c.say('user', 'okay, bye');
    await c.advance(IDLE_AFTER_GOODBYE_MS + DISCONNECT_DELAY_MS);
    expect(ends(c)).toHaveLength(1);
    expect(c.appConnected).toBe(true);
  });
});

describe('a reopened call that goes quiet (#2532)', () => {
  /** Reopened by "oh wait, one more thing"; Ferni answers; then nobody speaks. */
  async function quietAfterReopen() {
    const c = await call();
    await lineAfterEnd(c, 'oh wait, one more thing', 'no read');
    await ferniSays(c, 'Sure, what is it?');
    return c;
  }

  it('Ferni checks in once after REOPEN_CHECK_IN_MS, then the idle end closes it', async () => {
    const c = await quietAfterReopen();
    await c.advance(REOPEN_CHECK_IN_MS - 1_000);
    expect(checkIns).toEqual([]);
    await c.advance(1_000);
    expect(checkIns).toEqual(['reopen_checkin']);
    await ferniSays(c, "I'm still here, no rush."); // his check-in starts nothing over
    await c.advance(REOPEN_IDLE_END_MS - REOPEN_CHECK_IN_MS - 1_000);
    expect(ends(c)).toHaveLength(1);
    await c.advance(1_000);
    expect(ends(c)).toEqual([
      '0 conversation_end idle_after_goodbye',
      '0 conversation_end idle_after_goodbye',
    ]);
    await c.advance(DISCONNECT_DELAY_MS);
    expect(c.appConnected).toBe(false);
    expect(checkIns).toEqual(['reopen_checkin']);
  });

  it('waits about a minute to check in and two to end (the existing 120 s idle)', () => {
    expect(REOPEN_CHECK_IN_MS).toBe(60_000);
    expect(REOPEN_IDLE_END_MS).toBe(120_000);
  });

  it('never ends while Ferni is still speaking', async () => {
    const c = await quietAfterReopen();
    await c.advance(REOPEN_CHECK_IN_MS);
    expect(checkIns).toEqual(['reopen_checkin']);
    c.agentState('speaking'); // a check-in that runs long
    await c.advance(REOPEN_IDLE_END_MS);
    expect(ends(c)).toHaveLength(1);
    c.agentState('listening');
    await c.advance(REOPEN_IDLE_END_MS + DISCONNECT_DELAY_MS);
    expect(ends(c)).toHaveLength(2);
    expect(c.appConnected).toBe(false);
  });

  it('the caller speaking starts the quiet over, and earns another check-in', async () => {
    const c = await quietAfterReopen();
    await c.advance(50_000);
    c.userState('speaking'); // voice activity alone starts it over
    c.userState('listening');
    await c.advance(REOPEN_CHECK_IN_MS - 1_000);
    expect(checkIns).toEqual([]);
    await c.advance(1_000);
    expect(checkIns).toEqual(['reopen_checkin']);
    c.say('user', 'sorry, I was just thinking'); // a turn starts it over too
    await c.advance(REOPEN_IDLE_END_MS - 1_000);
    expect(checkIns).toEqual(['reopen_checkin', 'reopen_checkin']);
    expect(ends(c)).toHaveLength(1);
    await c.advance(1_000 + DISCONNECT_DELAY_MS);
    expect(ends(c)).toHaveLength(2);
    expect(c.appConnected).toBe(false);
  });

  it("Ferni's reply starts the quiet over; the caller still speaking holds the end", async () => {
    const c = await call();
    await lineAfterEnd(c, 'oh wait, one more thing', 'no read');
    await c.advance(30_000);
    c.agentState('speaking'); // a long reply: no check-in over it
    await c.advance(REOPEN_CHECK_IN_MS + 5_000);
    expect(checkIns).toEqual([]);
    c.say('assistant', 'Take your time, I am listening.');
    c.agentState('listening');
    await c.advance(REOPEN_CHECK_IN_MS - 1_000);
    expect(checkIns).toEqual([]);
    await c.advance(1_000);
    expect(checkIns).toEqual(['reopen_checkin']);
    c.userState('speaking'); // and still speaking, by voice activity, at the idle end
    await c.advance(REOPEN_IDLE_END_MS + 10_000);
    expect(ends(c)).toHaveLength(1);
    expect(c.appConnected).toBe(true);
  });

  it('no check-in into a call whose goodbyes were said again but held for crisis risk', async () => {
    const c = await call();
    await c.toEnd();
    await c.advance(1_000);
    c.finalWords("I won't be here tomorrow. bye");
    await c.advance(300);
    c.say('user', "I won't be here tomorrow. bye");
    await ferniSays(c, "I'm right here with you. Can we keep talking?");
    c.say('user', 'okay, bye');
    await ferniSays(c, 'Okay. Bye, take care.');
    await c.advance(REOPEN_IDLE_END_MS * 2);
    expect(checkIns).toEqual([]);
    expect(ends(c)).toHaveLength(1);
    expect(c.appConnected).toBe(true);
  });

  it('a crisis hold gets the check-in but no idle end: the caller ends that call', async () => {
    const c = await call();
    await c.toEnd();
    await c.advance(1_000);
    c.finalWords("I won't be here tomorrow. bye");
    await c.advance(300);
    c.say('user', "I won't be here tomorrow. bye");
    expect(c.reopens()).toEqual(['1000 conversation_continue crisis_hold']);
    expect(crisisRiskThisCall(c.id)).toBe(true);
    await c.advance(REOPEN_IDLE_END_MS * 2);
    expect(checkIns).toEqual(['reopen_checkin']);
    expect(ends(c)).toHaveLength(1);
    expect(c.appConnected).toBe(true);
  });

  it('stops when the session closes', async () => {
    const c = await quietAfterReopen();
    c.session.emit('close', {});
    await c.advance(REOPEN_IDLE_END_MS * 2);
    expect(checkIns).toEqual([]);
    expect(ends(c)).toHaveLength(1);
  });

  it('a second reopen starts the quiet over, with one watcher', async () => {
    const c = await quietAfterReopen();
    await c.advance(20_000);
    c.say('user', 'okay, bye');
    await ferniSays(c, 'Bye, take care.');
    await c.advance(IDLE_AFTER_GOODBYE_MS);
    expect(ends(c)).toHaveLength(2);
    c.finalWords('oh wait, I forgot something'); // reopens again
    await c.advance(300);
    c.say('user', 'oh wait, I forgot something');
    expect(c.reopens()).toHaveLength(2);
    await c.advance(REOPEN_CHECK_IN_MS - 1_000);
    expect(checkIns).toEqual([]);
    await c.advance(1_000);
    expect(checkIns).toEqual(['reopen_checkin']);
    await c.advance(REOPEN_IDLE_END_MS);
    expect(checkIns).toEqual(['reopen_checkin']);
    expect(ends(c)).toHaveLength(3);
  });
});

describe('the reopening line is matched by whole words (#2532)', () => {
  it('"no" reopens; a later "know what, okay, bye" is a fresh goodbye', async () => {
    const c = await call();
    await c.toEnd();
    await c.advance(1_000);
    c.say('user', 'no'); // the item first, then the STT final that reopens
    c.finalWords('no');
    await c.advance(TURN_READ_WAIT_MS);
    expect(c.reopens()).toHaveLength(1);
    await ferniSays(c, 'No worries. Anything else?');
    c.say('user', 'know what, okay, bye');
    await ferniSays(c, 'Bye, take care.');
    await c.advance(IDLE_AFTER_GOODBYE_MS + DISCONNECT_DELAY_MS);
    expect(ends(c)).toHaveLength(2);
    expect(c.appConnected).toBe(false);
  });
});
