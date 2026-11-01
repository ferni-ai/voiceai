/**
 * A reopened app or phone call as prod wires it (attachCallWrapUp with its
 * AgentSession) on a simulated clock and app, shared by the wrap-up reopen
 * suites. Each suite mocks the director and coordinatedSay itself and calls
 * resetReopenedCalls() after each test.
 */
import { llm } from '@livekit/agents';
import { ParticipantKind } from '@livekit/rtc-node';
import { EventEmitter } from 'node:events';
import { expect } from 'vitest';
import { z } from 'zod';
import { PersonaVoiceAgent } from '../../personas/ferni-agent.js';
import { attachCallWrapUp } from '../call-wrap-up.js';
import { clearFarewell, IDLE_AFTER_GOODBYE_MS } from '../call-farewell.js';
import { clearSessionClosing, isSessionClosing } from '../session-closing-tracker.js';
import {
  initFrontendSignal,
  resetFrontendSignal,
} from '../../../services/communication/frontend-signal.js';
import { resetCrisisCallRisk, trackCrisisRead } from '../../../services/safety/crisis-call-risk.js';

const used: string[] = [];

/** Clear every call's closing, farewell, app signal and crisis state. */
export function resetReopenedCalls(): void {
  used.splice(0).forEach((id) => {
    clearSessionClosing(id);
    clearFarewell(id);
  });
  resetFrontendSignal();
  resetCrisisCallRisk();
}

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

export const flush = async (): Promise<void> => {
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
export async function call(
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

export type Call = Awaited<ReturnType<typeof call>>;
export const ends = (c: Call) => c.events.filter((e) => e.includes('conversation_end'));

/** Ferni's reply, played out. */
export const ferniSays = async (c: Call, text: string) => {
  c.agentState('speaking');
  c.say('assistant', text);
  c.agentState('listening');
  await flush();
};

/** A crisis read of the caller's words, started now and settled by hand. */
export function read(id: string, words: string) {
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
export async function cleanGoodbye(c: Call, words: string) {
  const settle = read(c.id, words);
  c.say('user', words);
  await settle('none');
}
