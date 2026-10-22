/**
 * #2291: between `conversation_end` and the room closing, crisis risk on the
 * call or the caller saying more than a goodbye reopens it. The app is sent
 * `conversation_continue` (which cancels its disconnect), the call is no longer
 * closing, nothing deletes the room, and the farewell watcher can arm again.
 */
import { llm } from '@livekit/agents';
import { ParticipantKind } from '@livekit/rtc-node';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PersonaVoiceAgent } from '../../personas/ferni-agent.js';
import { attachCallWrapUp, REMOVAL_GRACE_MS, wrapUpCall } from '../call-wrap-up.js';
import { clearFarewell, farewellSaid, IDLE_AFTER_GOODBYE_MS } from '../call-farewell.js';
import { clearSessionClosing, isSessionClosing } from '../session-closing-tracker.js';
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
});

let n = 0;

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
  await new Promise((r) => {
    setTimeout(r, 0);
  });
};

/**
 * An app call as prod wires it (attachCallWrapUp with its AgentSession), with a
 * manual clock. Every signal the app gets and every room delete lands in `events`.
 */
async function appCall(opts: { inRoom?: () => boolean } = {}) {
  const id = `continue-${++n}`;
  used.push(id);
  const events: string[] = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  initFrontendSignal(id, async (type, data) => {
    events.push(`${type} ${String(data?.reason)}`);
  });
  const session = new EventEmitter();
  const roomName = `room-${id}`;
  await attachCallWrapUp(agent(), {
    sessionId: id,
    room: {
      name: roomName,
      get remoteParticipants() {
        return { size: (opts.inRoom?.() ?? true) ? 1 : 0 };
      },
    },
    participant: { kind: ParticipantKind.STANDARD },
    onBehalf: false,
    env: { CALL_WRAP_UP: 'on' },
    session,
    hangUp: async (room) => void events.push(`deleted ${room}`),
    setTimer: (fn, ms) => {
      const timer = { fn, ms };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      const at = timers.indexOf(timer as (typeof timers)[number]);
      if (at >= 0) timers.splice(at, 1);
    },
  });
  const say = (role: 'user' | 'assistant', text: string) =>
    session.emit('conversation_item_added', { item: { type: 'message', role, textContent: text } });
  const agentState = (s: string) => session.emit('agent_state_changed', { newState: s });
  const goodbyes = () => {
    say('user', 'okay, bye!');
    agentState('speaking');
    say('assistant', 'Bye, take care.');
    agentState('listening');
  };
  /** Ferni's goodbyes, the quiet window, then `conversation_end`: the grace timer is pending. */
  const toGraceWindow = async () => {
    goodbyes();
    expect(timers.map((t) => t.ms)).toEqual([IDLE_AFTER_GOODBYE_MS]);
    timers.splice(0).forEach((t) => t.fn());
    await flush();
    expect(events).toEqual(['conversation_end idle_after_goodbye']);
    expect(isSessionClosing(id)).toBe(true);
    expect(timers.map((t) => t.ms)).toEqual([REMOVAL_GRACE_MS]);
  };
  const runTimers = async () => {
    for (let round = 0; round < 3; round++) {
      timers.splice(0).forEach((t) => t.fn());
      await flush();
    }
  };
  const listeners = () => session.listenerCount('conversation_item_added');
  return { id, roomName, events, timers, say, goodbyes, toGraceWindow, runTimers, listeners };
}

describe('wrap-up grace window (#2291)', () => {
  it('crisis risk noted after conversation_end reopens the call and nothing deletes the room', async () => {
    const c = await appCall();
    await c.toGraceWindow();

    noteCrisisRisk(c.id); // a crisis read of the caller's last words settles late
    await flush();
    expect(c.events).toEqual([
      'conversation_end idle_after_goodbye',
      'conversation_continue crisis_hold',
    ]);
    expect(isSessionClosing(c.id)).toBe(false);
    expect(farewellSaid(c.id)).toBe(false);

    await c.runTimers(); // the grace timer fires
    expect(c.events.some((e) => e.startsWith('deleted'))).toBe(false);
    expect(isSessionClosing(c.id)).toBe(false);
  });

  it('a crisis read started after the goodbye played reopens the call when it settles', async () => {
    const c = await appCall();
    await c.toGraceWindow();
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
    expect(c.events.at(-1)).toBe('conversation_continue crisis_hold');
    expect(isSessionClosing(c.id)).toBe(false);
  });

  it('a non-goodbye caller line reopens the call; a caller "bye!" does not', async () => {
    const bye = await appCall();
    await bye.toGraceWindow();
    bye.say('user', 'bye!');
    await flush();
    expect(bye.events).toEqual(['conversation_end idle_after_goodbye']);
    expect(isSessionClosing(bye.id)).toBe(true);
    await bye.runTimers();
    expect(bye.events.at(-1)).toBe(`deleted ${bye.roomName}`);

    const more = await appCall();
    await more.toGraceWindow();
    more.say('user', 'oh wait, one more thing');
    await flush();
    expect(more.events.at(-1)).toBe('conversation_continue caller_spoke');
    expect(isSessionClosing(more.id)).toBe(false);
    await more.runTimers();
    expect(more.events.some((e) => e.startsWith('deleted'))).toBe(false);
  });

  it('after it reopens, the farewell watcher arms again and a later goodbye ends the call', async () => {
    const c = await appCall();
    await c.toGraceWindow();
    c.say('user', 'oh wait, one more thing');
    await c.runTimers(); // the stale grace timer does nothing
    expect(c.events.at(-1)).toBe('conversation_continue caller_spoke');

    c.goodbyes();
    expect(c.timers.map((t) => t.ms)).toEqual([IDLE_AFTER_GOODBYE_MS]); // armed again
    await c.runTimers();
    expect(c.events.slice(-2)).toEqual([
      'conversation_end idle_after_goodbye',
      `deleted ${c.roomName}`,
    ]);
  });

  it('after it reopens, a later wrapUpCall on the same session proceeds', async () => {
    const c = await appCall();
    await c.toGraceWindow();
    c.say('user', 'actually, can you remind me about tomorrow?');
    await flush();
    const later: Array<() => void> = [];
    const again = await wrapUpCall(
      {
        sessionId: c.id,
        roomName: c.roomName,
        callerInRoom: () => false,
        setTimer: (fn) => void later.push(fn),
      },
      'goodbye_complete'
    );
    expect(again).toBe(true);
    expect(isSessionClosing(c.id)).toBe(true);
    expect(c.events.at(-1)).toBe('conversation_end goodbye_complete');
    later.forEach((fn) => fn());
  });

  it('the before_delete crisis hold reopens the call', async () => {
    const c = await appCall();
    await c.toGraceWindow();
    // A read still in flight when the grace ends: no risk noted yet, so only the hold sees it.
    void trackCrisisRead(c.id, 'turn', new Promise<{ risk: string }>(() => undefined));
    await c.runTimers();
    expect(c.events).toEqual([
      'conversation_end idle_after_goodbye',
      'conversation_continue crisis_hold',
    ]);
    expect(isSessionClosing(c.id)).toBe(false);
    expect(farewellSaid(c.id)).toBe(false);
  });

  it('once the room is closed, nothing reopens it and no watcher is left behind', async () => {
    const before = crisisRiskListenerCount();
    const c = await appCall();
    const watching = c.listeners(); // the farewell watcher's own listener
    await c.toGraceWindow();
    expect(crisisRiskListenerCount()).toBe(before + 1);
    expect(c.listeners()).toBe(watching + 1);

    await c.runTimers();
    expect(c.events.at(-1)).toBe(`deleted ${c.roomName}`);
    expect(crisisRiskListenerCount()).toBe(before);
    expect(c.listeners()).toBe(watching);

    noteCrisisRisk(c.id);
    c.say('user', 'hello?');
    await flush();
    expect(c.events.filter((e) => e.startsWith('conversation_continue'))).toEqual([]);
  });

  it('the app already left: the watchers are still removed and nothing is sent', async () => {
    let inRoom = true;
    const before = crisisRiskListenerCount();
    const c = await appCall({ inRoom: () => inRoom });
    const watching = c.listeners();
    await c.toGraceWindow();
    inRoom = false;
    await c.runTimers();
    expect(crisisRiskListenerCount()).toBe(before);
    expect(c.listeners()).toBe(watching);
    expect(c.events).toEqual(['conversation_end idle_after_goodbye']);
  });

  it('reopens at most once, and unsubscribes when it does', async () => {
    const before = crisisRiskListenerCount();
    const c = await appCall();
    const watching = c.listeners();
    await c.toGraceWindow();
    noteCrisisRisk(c.id);
    c.say('user', 'are you still there?');
    noteCrisisRisk(c.id);
    await flush();
    expect(c.events.filter((e) => e.startsWith('conversation_continue'))).toEqual([
      'conversation_continue crisis_hold',
    ]);
    expect(crisisRiskListenerCount()).toBe(before);
    expect(c.listeners()).toBe(watching);
  });

  it('crisis risk on another call does not reopen this one', async () => {
    const c = await appCall();
    await c.toGraceWindow();
    noteCrisisRisk('another-call');
    await c.runTimers();
    expect(c.events.at(-1)).toBe(`deleted ${c.roomName}`);
  });
});
