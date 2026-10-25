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

/** What Ferni says at a check-in (coordinatedSay), and the director's line for it. */
const checkIns = vi.hoisted(() => [] as string[]);
const director = vi.hoisted(() => ({
  line: "I'm still here, no rush.",
  cues: [] as Array<{ moment: string; rejectIf?: (line: string) => boolean }>,
  gate: Promise.resolve(),
}));
vi.mock('../../../speech/direction/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../speech/direction/index.js')>()),
  directedText: async (_id: string, cue: { moment: string }) => {
    director.cues.push(cue);
    await director.gate;
    return { text: director.line, source: 'actor', ms: 0 };
  },
}));
vi.mock('../../../speech/coordination/session-integration.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../speech/coordination/session-integration.js')>()),
  coordinatedSay: (_id: string, text: string) =>
    void checkIns.push(text === director.line ? 'reopen_checkin' : text),
}));

import { PersonaVoiceAgent } from '../../personas/ferni-agent.js';
import { attachCallWrapUp, DISCONNECT_DELAY_MS } from '../call-wrap-up.js';
import { clearFarewell, containsLine, IDLE_AFTER_GOODBYE_MS } from '../call-farewell.js';
import { TURN_READ_WAIT_MS } from '../caller-activity.js';
import { REOPEN_CHECK_IN_MS, REOPEN_IDLE_END_MS, watchReopenIdle } from '../reopen-idle.js';
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
  director.cues.splice(0);
  director.gate = Promise.resolve();
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
  opts: {
    phone?: boolean;
    env?: Record<string, string>;
    appStays?: boolean;
    /** Wrap-ups attached to the one AgentSession (a persona swap attaches its own). */
    wrapUps?: number;
  } = {}
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
  for (let i = 0; i < (opts.wrapUps ?? 1); i++) {
    // eslint-disable-next-line no-await-in-loop -- attached in order, as a persona swap does
    await attachCallWrapUp(i === 0 ? a : agent(), {
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
  }
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
 * The caller's goodbye turn, read clean as prod reads it: the turn's crisis
 * read starts (onUserTurnCompleted), then LiveKit adds its item. After a
 * reopen, with the classifier on, a goodbye ends the call only on that read
 * (goodbye-read.ts).
 */
async function cleanGoodbye(c: Call, words: string) {
  const settle = read(c.id, words);
  c.say('user', words);
  await settle('none');
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
    await cleanGoodbye(c, "yeah, I'm fine. okay, bye!");
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
    await cleanGoodbye(c, 'actually never mind. okay, bye!');
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
    expect(director.cues).toEqual([]); // not even a line written
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
    await cleanGoodbye(c, 'okay, bye');
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

/**
 * The reopening turn's conversation item lands only after LiveKit has run the
 * turn and scheduled the reply: seconds after its STT final, with no bound
 * (#2532 round-2 verify, P1 and P10). The carry is keyed to the turn, never a
 * clock.
 */
const LATE_ITEM_MS = [300, 3_100, 6_000, 15_000];
const P1 = ['goodbye cruel world. I gotta go', 'never. I gotta go', "I can't anymore. I'm off"];

describe("the reopening turn's own item, however late, is never the fresh goodbye", () => {
  describe.each(LATE_ITEM_MS)('item %d ms after the final', (lag) => {
    it.each(P1)('"%s": open with no read and with a read of none', async (line) => {
      for (const readAs of ['no read', 'none'] as const) {
        const c = await call();
        await c.toEnd();
        await c.advance(1_000);
        c.finalWords(line);
        expect(c.reopens()).toHaveLength(1);
        await c.advance(lag);
        c.say('user', line);
        if (readAs === 'none') {
          const settle = read(c.id, line);
          await c.advance(800);
          await settle('none');
        }
        await ferniSays(c, 'Okay, take care of yourself.');
        await c.advance(30_000);
        expect(ends(c)).toHaveLength(1);
        expect(c.appConnected).toBe(true);
      }
    });

    it('"thanks so much, that helped. bye" with no read: Rule 1 stays fail-closed', async () => {
      const line = 'thanks so much, that helped. bye';
      const c = await call();
      await c.toEnd();
      await c.advance(1_000);
      c.finalWords(line);
      await c.advance(lag);
      c.say('user', line);
      await c.advance(Math.max(0, 5_000 - lag));
      expect(c.reopens()).toHaveLength(1); // no read within TURN_READ_WAIT_MS: carried on
      expect(c.reopens()[0]).toContain('caller_spoke');
      await ferniSays(c, 'Okay. Bye, take care.');
      await c.advance(30_000);
      expect(ends(c)).toHaveLength(1);
      expect(c.appConnected).toBe(true);
    });
  });

  it('Ferni speaking, or the caller starting again, before the item does not end the carry', async () => {
    const c = await call();
    await c.toEnd();
    await c.advance(1_000);
    c.finalWords('never.'); // reopens; the turn goes on
    c.finalWords('I gotta go');
    await ferniSays(c, "Hey, I'm right here."); // a line not in reply to the turn
    c.userState('speaking');
    c.userState('listening');
    await c.advance(6_000);
    c.say('user', 'never. I gotta go'); // the turn's item, at last
    await ferniSays(c, 'Okay, take care of yourself.');
    await c.advance(30_000);
    expect(ends(c)).toHaveLength(1);
    expect(c.appConnected).toBe(true);
  });

  it('two wrap-ups on one session (a persona swap): one farewell watcher, so the carry holds', async () => {
    const c = await call({ wrapUps: 2 });
    await c.toEnd();
    await c.advance(1_000);
    c.finalWords('never. I gotta go');
    expect(c.reopens()).toHaveLength(1);
    await c.advance(3_100);
    c.say('user', 'never. I gotta go'); // the turn's own item, late
    await ferniSays(c, 'Okay, take care of yourself.');
    await c.advance(30_000);
    expect(ends(c)).toHaveLength(1);
    expect(c.appConnected).toBe(true);
  });

  it('the next turn ends the carry: a goodbye that repeats the line then counts', async () => {
    const c = await call();
    await lineAfterEnd(c, 'wait', 'no read');
    await ferniSays(c, 'Sure, what is it?');
    await cleanGoodbye(c, 'wait, never mind. okay, bye'); // the next turn
    await ferniSays(c, 'Bye, take care.');
    await c.advance(IDLE_AFTER_GOODBYE_MS + DISCONNECT_DELAY_MS);
    expect(ends(c)).toHaveLength(2);
    expect(c.appConnected).toBe(false);
  });

  it("if the turn's item never arrives, the next turn ends the carry, by whole words", async () => {
    const c = await call();
    await c.toEnd();
    await c.advance(1_000);
    c.finalWords('no'); // reopens; its item never comes
    expect(c.reopens()).toHaveLength(1);
    await ferniSays(c, 'No worries. Anything else?');
    await cleanGoodbye(c, 'know what, okay, bye'); // "no" only inside a word: a fresh goodbye
    await ferniSays(c, 'Bye, take care.');
    await c.advance(IDLE_AFTER_GOODBYE_MS + DISCONNECT_DELAY_MS);
    expect(ends(c)).toHaveLength(2);
    expect(c.appConnected).toBe(false);
  });

  it('a next turn without the line ends the carry for good', async () => {
    const c = await call();
    await c.toEnd();
    await c.advance(1_000);
    c.finalWords('wait'); // reopens; its item never comes
    expect(c.reopens()).toHaveLength(1);
    c.say('user', 'sorry, my dog'); // the next turn: the carry ends
    await ferniSays(c, "Ha, no problem. What's up?");
    await cleanGoodbye(c, 'wait, never mind. okay, bye');
    await ferniSays(c, 'Bye, take care.');
    await c.advance(IDLE_AFTER_GOODBYE_MS + DISCONNECT_DELAY_MS);
    expect(ends(c)).toHaveLength(2);
    expect(c.appConnected).toBe(false);
  });

  it('a line whose item already came carries nothing: a later reopen does not swallow the next turn', async () => {
    const line = 'thanks so much, that helped. bye';
    const c = await call();
    await c.toEnd();
    await c.advance(1_000);
    c.finalWords(line);
    await c.advance(300);
    c.say('user', line); // its item, while the call was still closing
    await c.advance(3_000); // no read: the window reopens it
    expect(c.reopens()).toHaveLength(1);
    await ferniSays(c, 'Of course. Anything else on your mind?');
    await cleanGoodbye(c, line); // said again, a new turn: a fresh goodbye
    await ferniSays(c, 'Bye, take care.');
    await c.advance(IDLE_AFTER_GOODBYE_MS + DISCONNECT_DELAY_MS);
    expect(ends(c)).toHaveLength(2);
    expect(c.appConnected).toBe(false);
  });

  it('the item before the final (it reopened the call itself) carries nothing either', async () => {
    const c = await call();
    await c.toEnd();
    await c.advance(1_000);
    c.say('user', 'hold on'); // the item reopens; then its STT final
    c.finalWords('hold on');
    expect(c.reopens()).toHaveLength(1);
    await ferniSays(c, 'Sure, take your time.');
    await cleanGoodbye(c, 'hold on, never mind. okay, bye');
    await ferniSays(c, 'Bye, take care.');
    await c.advance(IDLE_AFTER_GOODBYE_MS + DISCONNECT_DELAY_MS);
    expect(ends(c)).toHaveLength(2);
    expect(c.appConnected).toBe(false);
  });
});

describe('items out of turn order, and reads of other turns (security review of the redesign)', () => {
  it("an earlier turn's late item does not use up the carry", async () => {
    const c = await call();
    await c.toEnd();
    await c.advance(1_000);
    c.finalWords('bye'); // turn A: a sign-off, its item still to come
    await c.advance(500);
    c.finalWords("I don't know"); // turn B reopens
    expect(c.reopens()).toHaveLength(1);
    c.finalWords('anyway, bye');
    await c.advance(2_000);
    c.say('user', 'bye'); // turn A's item, late
    await c.advance(2_000);
    c.say('user', "I don't know, anyway, bye"); // turn B's item
    await ferniSays(c, 'Okay. Bye, take care.');
    await c.advance(30_000);
    expect(ends(c)).toHaveLength(1);
    expect(c.appConnected).toBe(true);
  });

  it("an earlier turn's item inside the window clears only its own final", async () => {
    const line = 'thanks so much, that helped. bye';
    const c = await call();
    await c.toEnd();
    await c.advance(500);
    c.finalWords('bye'); // turn A
    await c.advance(500);
    c.finalWords(line); // turn B: waits for its read
    await c.advance(300);
    c.say('user', 'bye'); // turn A's item, while the call is still closing
    await c.advance(3_000); // no read for B: the window reopens it
    expect(c.reopens()).toHaveLength(1);
    await c.advance(3_000);
    c.say('user', line); // turn B's item, late
    await ferniSays(c, 'Okay. Bye, take care.');
    await c.advance(30_000);
    expect(ends(c)).toHaveLength(1);
    expect(c.appConnected).toBe(true);
  });

  it("Rule 1, LiveKit's order: the read starts before the turn's item, and a clean read ends the call", async () => {
    const line = 'thanks so much, that helped. bye';
    const c = await call();
    await c.toEnd();
    await c.advance(1_000);
    c.finalWords(line);
    const settle = read(c.id, line); // onUserTurnCompleted: the read starts
    await c.advance(300);
    c.say('user', line); // then LiveKit adds the item
    await c.advance(500);
    await settle('none');
    await c.advance(10_000);
    expect(c.reopens()).toEqual([]);
    expect(c.appConnected).toBe(false);
  });

  it('an item with no STT final of its own gets its own read wait, by content not order', async () => {
    const line = 'thanks so much, that helped. bye';
    const c = await call();
    await c.toEnd();
    await c.advance(1_000);
    c.finalWords('okay, talk soon'); // a sign-off whose item never comes
    await c.advance(300);
    c.say('user', line); // a turn with no STT final (typed, say)
    const other = read(c.id, 'okay, talk soon'); // the sign-off's read, clean
    await c.advance(500);
    await other('none');
    await c.advance(3_000); // the item's own read never comes: fails closed
    expect(c.reopens()).toHaveLength(1);
    expect(c.appConnected).toBe(true);
  });

  it('a carried line with an accent is matched by its letters, not ASCII: "Adi\'s" is not "adiós"', async () => {
    const c = await call();
    await c.toEnd();
    await c.advance(500);
    c.finalWords('adiós'); // turn A: a sign-off, its item never comes
    await c.advance(500);
    c.finalWords('oh wait'); // turn B reopens, carrying both
    expect(c.reopens()).toHaveLength(1);
    await c.advance(300);
    c.say('user', 'oh wait');
    await ferniSays(c, 'Sure, what is it?');
    await cleanGoodbye(c, "sorry, Adi's calling me. okay, bye"); // the next turn: a fresh goodbye
    await ferniSays(c, 'Bye, take care.');
    await c.advance(IDLE_AFTER_GOODBYE_MS + DISCONNECT_DELAY_MS);
    expect(ends(c)).toHaveLength(2);
    expect(c.appConnected).toBe(false);
  });

  it("a late read of an earlier turn does not settle a Rule 1 line's wait", async () => {
    const line = 'thanks so much, that helped. bye';
    const c = await call();
    await c.toEnd();
    await c.advance(1_000);
    c.finalWords(line);
    const other = read(c.id, 'okay, bye!'); // the goodbye turn before the end, read late
    await c.advance(200);
    await other('none');
    await c.advance(3_000); // the line's own read never comes: fails closed
    expect(c.reopens()).toHaveLength(1);
    expect(c.appConnected).toBe(true);
  });
});

describe('containsLine', () => {
  it('matches whole words after folding case and punctuation', () => {
    expect(containsLine('Never. I gotta go!', 'never')).toBe(true);
    expect(containsLine('know what, okay, bye', 'no')).toBe(false);
  });

  it('keeps letters outside ASCII as letters, after NFKC and case folding', () => {
    expect(containsLine('ADIÓS. Gotta go', 'adiós')).toBe(true);
    expect(containsLine('adiós, gotta go', 'adiós')).toBe(true); // decomposed accent
    expect(containsLine('ｎｅｖｅｒ. I gotta go', 'never')).toBe(true); // full-width
    expect(containsLine("sorry, Adi's calling me", 'adiós')).toBe(false);
    expect(containsLine('it’s okay, bye', 'sí')).toBe(false);
  });
});

describe('the check-in (#2532 security review)', () => {
  it('is never a goodbye: a director line that says one falls back to the understudy', async () => {
    const c = await call();
    await lineAfterEnd(c, 'oh wait, one more thing', 'no read');
    await c.advance(REOPEN_CHECK_IN_MS);
    const cue = director.cues[0];
    expect(cue?.moment).toBe('reopen_checkin');
    expect(cue?.rejectIf?.('Okay, take care.')).toBe(true);
    expect(cue?.rejectIf?.("I'm here. Bye for now?")).toBe(true); // asked, still a goodbye
    expect(cue?.rejectIf?.("I'm still here, no rush.")).toBe(false);
  });

  it('is not spoken if the call went quiet while the line was being written', async () => {
    const c = await call();
    await lineAfterEnd(c, 'oh wait, one more thing', 'no read');
    let release: () => void = () => {};
    director.gate = new Promise<void>((r) => {
      release = r;
    });
    await c.advance(REOPEN_CHECK_IN_MS);
    expect(director.cues).toHaveLength(1);
    c.say('user', 'okay, bye'); // both goodbyes again: the call is ending
    await ferniSays(c, 'Bye, take care.');
    release();
    await flush();
    expect(checkIns).toEqual([]);
  });

  it('is not spoken over a caller who started talking while it was being written', async () => {
    const c = await call();
    await lineAfterEnd(c, 'oh wait, one more thing', 'no read');
    let release: () => void = () => {};
    director.gate = new Promise<void>((r) => {
      release = r;
    });
    await c.advance(REOPEN_CHECK_IN_MS);
    expect(director.cues).toHaveLength(1);
    c.interim('so I was');
    release();
    await flush();
    expect(checkIns).toEqual([]);
  });

  it('waits while the caller is mid-utterance, and a transcript starts the quiet over', async () => {
    const c = await call();
    await lineAfterEnd(c, 'oh wait, one more thing', 'no read');
    await c.advance(50_000);
    c.interim('so what I was'); // and no final yet
    await c.advance(REOPEN_CHECK_IN_MS + 5_000);
    expect(checkIns).toEqual([]);
    c.finalWords('hmm'); // a final transcript alone, no turn or voice activity
    await c.advance(REOPEN_CHECK_IN_MS - 1_000);
    expect(checkIns).toEqual([]);
    await c.advance(1_000);
    expect(checkIns).toEqual(['reopen_checkin']);
  });

  it('one watcher per session: a second wrap-up on the same session replaces the first', async () => {
    const session = new EventEmitter();
    const timers: Array<{ fn: () => void; at: number }> = [];
    let now = 0;
    const said: string[] = [];
    const caller = {
      busy: () => false,
      talking: () => false,
      onWords: () => () => {},
      stop: () => {},
    };
    const watch = () =>
      watchReopenIdle(session, {
        caller,
        checkIn: () => void said.push('check-in'),
        end: () => void said.push('end'),
        setTimer: (fn, ms) => {
          const t = { fn, at: now + ms };
          timers.push(t);
          return t;
        },
        clearTimer: (t) =>
          void timers.splice(timers.indexOf(t as (typeof timers)[number]) >>> 0, 1),
      });
    watch();
    watch(); // e.g. a persona swap's own wrap-up reopening the same call
    now = REOPEN_IDLE_END_MS;
    timers.filter((t) => t.at <= now).forEach((t) => t.fn());
    expect(said).toEqual(['check-in', 'end']);
  });
});

/**
 * The lead's ruling B on #2605 item 3: after a reopen, with the classifier on,
 * a goodbye pair ends the call only on a clean read of the goodbye turn. With
 * it off (no read ever comes), a fresh pair ends it as before.
 */
describe('after a reopen, a goodbye needs its clean read (#2605 ruling B)', () => {
  /** "goodbye cruel world." reopens; "I gotta go" follows as its own turn; Ferni says goodbye. */
  async function splitP1(
    c: Call,
    opts: { asks?: boolean; goodbye?: (c: Call) => Promise<void> } = {}
  ) {
    await c.toEnd();
    await c.advance(1_000);
    c.finalWords('goodbye cruel world.');
    await c.advance(300);
    c.say('user', 'goodbye cruel world.');
    expect(c.reopens()).toHaveLength(1);
    if (opts.asks) await ferniSays(c, 'Hey, are you okay?');
    await c.advance(2_000);
    c.finalWords('I gotta go');
    await c.advance(300);
    await (opts.goodbye ?? (async (cc: Call) => void cc.say('user', 'I gotta go')))(c);
    await ferniSays(c, 'Okay, take care of yourself.');
  }

  it.each([false, true])(
    'no read of either line: the call stays open (Ferni asks first: %s)',
    async (asks) => {
      const c = await call();
      await splitP1(c, { asks });
      await c.advance(30_000);
      expect(ends(c)).toHaveLength(1);
      expect(c.appConnected).toBe(true);
    }
  );

  it('a clean read of the goodbye turn ends it', async () => {
    const c = await call();
    await splitP1(c, { goodbye: (cc) => cleanGoodbye(cc, 'I gotta go') });
    await c.advance(IDLE_AFTER_GOODBYE_MS + DISCONNECT_DELAY_MS);
    expect(ends(c)).toHaveLength(2);
    expect(c.appConnected).toBe(false);
  });

  it('a read of another line does not count for the goodbye', async () => {
    const c = await call();
    await splitP1(c, {
      goodbye: async (cc) => {
        await read(cc.id, 'goodbye cruel world.')('none');
        cc.say('user', 'I gotta go');
      },
    });
    await c.advance(30_000);
    expect(ends(c)).toHaveLength(1);
    expect(c.appConnected).toBe(true);
  });

  it('classifier in shadow: it still reads every turn, so no read holds the call open', async () => {
    const c = await call({
      env: { CALL_WRAP_UP: 'on', PHONE_GOODBYE: 'on', CRISIS_CLASSIFIER_MODE: 'shadow' },
    });
    await splitP1(c);
    await c.advance(30_000);
    expect(ends(c)).toHaveLength(1);
    expect(c.appConnected).toBe(true);
  });

  it('a clean read of the same words from before the reopen does not count', async () => {
    const line = 'i took everything, goodbye';
    const c = await call();
    await read(c.id, line)('none'); // said and read clean earlier in the call
    await c.toEnd();
    await c.advance(1_000);
    c.finalWords('oh wait');
    await c.advance(300);
    c.say('user', 'oh wait');
    expect(c.reopens()).toHaveLength(1);
    await ferniSays(c, 'Sure, what is it?');
    c.finalWords(line);
    c.say('user', line); // said again after the reopen: no read of this turn
    await ferniSays(c, 'Okay, take care of yourself.');
    await c.advance(30_000);
    expect(ends(c)).toHaveLength(1);
    expect(c.appConnected).toBe(true);
  });

  it('classifier off: no read ever comes, and a fresh pair still ends the call', async () => {
    const c = await call({
      env: { CALL_WRAP_UP: 'on', PHONE_GOODBYE: 'on', CRISIS_CLASSIFIER_MODE: 'off' },
    });
    await splitP1(c);
    await c.advance(IDLE_AFTER_GOODBYE_MS + DISCONNECT_DELAY_MS);
    expect(ends(c)).toHaveLength(2);
    expect(c.appConnected).toBe(false);
  });
});
