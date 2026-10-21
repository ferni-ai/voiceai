/**
 * CALL_WRAP_UP: an app caller's agent gets endCall, and calling it through the
 * SDK's own dispatcher lets the goodbye finish, marks the call closing, sends
 * the app conversation_end, then deletes the room if the caller is still in it.
 */
import { llm } from '@livekit/agents';
import { ParticipantKind } from '@livekit/rtc-node';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PersonaVoiceAgent } from '../../personas/ferni-agent.js';
import {
  attachCallWrapUp,
  DISCONNECT_DELAY_MS,
  REMOVAL_GRACE_MS,
  WRAP_UP_DESCRIPTION,
  wrapUpCall,
} from '../call-wrap-up.js';
import { clearFarewell, farewellSaid, IDLE_AFTER_GOODBYE_MS } from '../call-farewell.js';
import { CRISIS_HOLD, END_CALL } from '../phone-goodbye.js';
import { clearSessionClosing, isSessionClosing } from '../session-closing-tracker.js';
import {
  resetFrontendSignal,
  initFrontendSignal,
} from '../../../services/communication/frontend-signal.js';
import {
  noteCrisisRisk,
  resetCrisisCallRisk,
  trackCrisisRead,
} from '../../../services/safety/crisis-call-risk.js';

const ON = { CALL_WRAP_UP: 'on' };
const appCaller = { kind: ParticipantKind.STANDARD };
const phoneCaller = { kind: ParticipantKind.SIP };

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
function sessionId(): string {
  const id = `wrap-${++n}`;
  used.push(id);
  return id;
}

function agent(extra: string[] = []): PersonaVoiceAgent {
  const tool = (name: string) =>
    llm.tool({ name, description: name, parameters: z.object({}), execute: async () => 'ok' });
  return new PersonaVoiceAgent('You are Ferni.', {
    tools: new llm.ToolContext(['getWeather', ...extra].map(tool)) as unknown as llm.ToolContext,
    skipGreeting: true,
  });
}

const names = (a: PersonaVoiceAgent) => Object.keys(a.toolCtx.functionTools);

/** endCall through the SDK's dispatcher. Returns the tool output ('' asks for no reply). */
async function callEndCall(a: PersonaVoiceAgent, playout: () => Promise<void>): Promise<string> {
  const dist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));
  const { performToolExecutions } = (await import(
    pathToFileURL(join(dist, 'voice', 'generation.js')).href
  )) as {
    performToolExecutions: (
      opts: unknown
    ) => [{ result: Promise<unknown> }, { output: Array<{ toolCallOutput?: { output: string } }> }];
  };
  const [task, out] = performToolExecutions({
    session: { userData: {}, currentAgent: a },
    speechHandle: { id: 'speech-1', numSteps: 1, _waitForGeneration: playout },
    toolCtx: a.toolCtx,
    toolChoice: 'auto',
    toolCallStream: new ReadableStream({
      start(controller) {
        controller.enqueue(llm.FunctionCall.create({ callId: 'c1', name: END_CALL, args: '{}' }));
        controller.close();
      },
    }),
    controller: new globalThis.AbortController(),
  });
  await task.result;
  return out.output[0]?.toolCallOutput?.output ?? '';
}

/** An app call with CALL_WRAP_UP on, recording every step in `events`. */
async function appCall(opts: { inRoom?: boolean; hangUpFails?: boolean } = {}) {
  const id = sessionId();
  const events: string[] = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  initFrontendSignal(id, async (type, data) => {
    events.push(
      `${type} ${String(data?.reason)} ${String(data?.disconnectDelay)} closing=${isSessionClosing(id)}`
    );
  });
  const a = agent();
  const added = await attachCallWrapUp(a, {
    sessionId: id,
    room: { name: `room-${id}`, remoteParticipants: { size: opts.inRoom === false ? 0 : 1 } },
    participant: appCaller,
    onBehalf: false,
    env: ON,
    hangUp: async (room) => {
      if (opts.hangUpFails) {
        events.push('delete attempted');
        throw new Error('no credentials');
      }
      events.push(`deleted ${room}`);
    },
    setTimer: (fn, ms) => void timers.push({ fn, ms }),
  });
  const playout = async () => void events.push(`played closing=${isSessionClosing(id)}`);
  const runTimers = async () => {
    timers.splice(0).forEach((t) => t.fn());
    await new Promise((r) => {
      setTimeout(r, 0);
    });
  };
  return { id, a, added, events, timers, playout, runTimers };
}

describe('call wrap-up (CALL_WRAP_UP)', () => {
  it('gives an app caller endCall, described for a mutual goodbye only', async () => {
    const { a, added } = await appCall();
    expect(added).toBe(true);
    expect(names(a)).toEqual(['getWeather', END_CALL]);
    expect(a.toolCtx.functionTools[END_CALL]?.description).toBe(WRAP_UP_DESCRIPTION);
    expect(WRAP_UP_DESCRIPTION).toMatch(/ONLY after a mutual goodbye/);
    expect(WRAP_UP_DESCRIPTION).toMatch(/never ends a call that has had a crisis moment/);
    expect(WRAP_UP_DESCRIPTION).not.toMatch(/unless the caller/);
  });

  it('runs playout, closing, conversation_end, then deletes the room after the grace', async () => {
    const c = await appCall();
    const output = await callEndCall(c.a, c.playout);
    expect(output).toBe(''); // no follow-up reply after the goodbye
    expect(c.events).toEqual([
      'played closing=false',
      `conversation_end goodbye_complete ${DISCONNECT_DELAY_MS} closing=true`,
    ]);
    expect(isSessionClosing(c.id)).toBe(true);
    expect(c.timers.map((t) => t.ms)).toEqual([REMOVAL_GRACE_MS]);

    await c.runTimers();
    expect(c.events.at(-1)).toBe(`deleted room-${c.id}`);
  });

  it('is idempotent: a second endCall sends nothing and deletes nothing', async () => {
    const c = await appCall();
    await callEndCall(c.a, c.playout);
    await callEndCall(c.a, c.playout);
    expect(c.events.filter((e) => e.startsWith('conversation_end'))).toHaveLength(1);
    expect(c.timers).toHaveLength(1);
    await c.runTimers();
    await callEndCall(c.a, c.playout);
    expect(c.events.filter((e) => e.startsWith('deleted'))).toHaveLength(1);
    expect(c.timers).toHaveLength(0);
  });

  it('leaves the room alone when the app already left, and survives a failed delete', async () => {
    const gone = await appCall({ inRoom: false });
    await callEndCall(gone.a, gone.playout);
    await gone.runTimers();
    expect(gone.events.some((e) => e.startsWith('deleted'))).toBe(false);

    const stuck = await appCall({ hangUpFails: true });
    await callEndCall(stuck.a, stuck.playout);
    await stuck.runTimers();
    expect(stuck.events.at(-1)).toBe('delete attempted');
    expect(isSessionClosing(stuck.id)).toBe(true);
  });

  it('still ends the call when playout is cut off or the signal fails', async () => {
    const id = sessionId();
    const steps: string[] = [];
    const began = await wrapUpCall(
      {
        sessionId: id,
        roomName: 'r',
        callerInRoom: () => true,
        signal: async () => {
          throw new Error('data channel closed');
        },
        hangUp: async () => void steps.push('deleted'),
        setTimer: (fn) => void fn(),
      },
      'goodbye_complete',
      async () => {
        throw new Error('interrupted');
      }
    );
    await new Promise((r) => {
      setTimeout(r, 0);
    });
    expect(began).toBe(true);
    expect(isSessionClosing(id)).toBe(true);
    expect(steps).toEqual(['deleted']);
  });

  it('runs once when endCall is called twice while the goodbye is still playing', async () => {
    const id = sessionId();
    const signals: string[] = [];
    let finishPlayout: () => void = () => {};
    const playing = new Promise<void>((resolve) => {
      finishPlayout = resolve;
    });
    const call = {
      sessionId: id,
      roomName: 'r',
      callerInRoom: () => false,
      signal: async (type: string) => {
        signals.push(type);
        return true;
      },
      setTimer: () => undefined,
    };
    const first = wrapUpCall(call, 'goodbye_complete', async () => playing);
    const second = wrapUpCall(call, 'goodbye_complete', async () => playing);
    finishPlayout();
    expect(await Promise.all([first, second])).toEqual([true, false]);
    expect(signals).toEqual(['conversation_end']);
  });

  it('does nothing for a call that is already closing', async () => {
    const c = await appCall();
    const { markSessionClosing } = await import('../session-closing-tracker.js');
    markSessionClosing(c.id);
    await callEndCall(c.a, c.playout);
    expect(c.events).toEqual([]);
    expect(c.timers).toHaveLength(0);
  });

  it('flag off: app callers get no endCall; phone callers keep PHONE_GOODBYE', async () => {
    const off = [{}, { CALL_WRAP_UP: 'off' }];
    for (const env of off) {
      const a = agent();
      const added = await attachCallWrapUp(a, {
        sessionId: sessionId(),
        room: { name: 'r', remoteParticipants: { size: 1 } },
        participant: appCaller,
        onBehalf: false,
        env,
      });
      expect(added).toBe(false);
      expect(names(a)).toEqual(['getWeather']);
    }

    const phone = agent();
    const phoneAdded = await attachCallWrapUp(phone, {
      sessionId: sessionId(),
      room: { name: 'r' },
      participant: phoneCaller,
      onBehalf: false,
      env: { PHONE_GOODBYE: 'on' },
    });
    expect(phoneAdded).toBe(true);
    expect(phone.toolCtx.functionTools[END_CALL]?.description).not.toBe(WRAP_UP_DESCRIPTION);

    const phoneWrapOnly = agent();
    expect(
      await attachCallWrapUp(phoneWrapOnly, {
        sessionId: sessionId(),
        room: { name: 'r' },
        participant: phoneCaller,
        onBehalf: false,
        env: ON,
      })
    ).toBe(false);
  });

  it('leaves on-behalf calls and an agent that already has endCall alone', async () => {
    for (const c of [
      { onBehalf: true, extra: [] },
      { onBehalf: false, extra: [END_CALL] },
    ]) {
      const a = agent(c.extra);
      const before = names(a);
      const added = await attachCallWrapUp(a, {
        sessionId: sessionId(),
        room: { name: 'r' },
        participant: appCaller,
        onBehalf: c.onBehalf,
        env: ON,
      });
      expect(added).toBe(false);
      expect(names(a)).toEqual(before);
    }
  });
});

describe('call wrap-up on a call with crisis risk', () => {
  it('ends nothing once crisis risk is noted, and tells Ferni to stay', async () => {
    const c = await appCall();
    noteCrisisRisk(c.id);
    expect(await callEndCall(c.a, c.playout)).toBe(JSON.stringify(CRISIS_HOLD));
    expect(c.events).toEqual([]); // no playout wait, no conversation_end
    expect(isSessionClosing(c.id)).toBe(false);
    expect(c.timers).toHaveLength(0); // no room delete scheduled
  });

  it('holds while a crisis read is still in flight, and ends the call once it reads clean', async () => {
    const c = await appCall();
    let finish: (v: { risk: string }) => void = () => {};
    const read = trackCrisisRead(
      c.id,
      'turn',
      new Promise<{ risk: string }>((resolve) => {
        finish = resolve;
      })
    );
    expect(await callEndCall(c.a, c.playout)).toBe(JSON.stringify(CRISIS_HOLD));
    expect(isSessionClosing(c.id)).toBe(false);
    expect(c.timers).toHaveLength(0);

    finish({ risk: 'none' });
    await read;
    expect(await callEndCall(c.a, c.playout)).toBe('');
    expect(isSessionClosing(c.id)).toBe(true);
    expect(c.timers.map((t) => t.ms)).toEqual([REMOVAL_GRACE_MS]);
  });

  it('ends nothing when crisis risk is noted while the goodbye plays', async () => {
    const c = await appCall();
    const output = await callEndCall(c.a, async () => {
      c.events.push('played');
      noteCrisisRisk(c.id);
    });
    expect(output).toBe(JSON.stringify(CRISIS_HOLD));
    expect(c.events).toEqual(['played']); // no conversation_end
    expect(isSessionClosing(c.id)).toBe(false);
    expect(farewellSaid(c.id)).toBe(false); // Ferni is not kept quiet
    expect(c.timers).toHaveLength(0); // no room delete scheduled
  });

  it('does not delete the room when crisis risk is noted during the grace window', async () => {
    const c = await appCall();
    expect(await callEndCall(c.a, c.playout)).toBe('');
    expect(c.timers.map((t) => t.ms)).toEqual([REMOVAL_GRACE_MS]);
    noteCrisisRisk(c.id);
    await c.runTimers();
    expect(c.events.some((e) => e.startsWith('deleted'))).toBe(false);
  });

  it('ends the call as before when it has no risk, even if another call does', async () => {
    noteCrisisRisk('another-call');
    const c = await appCall();
    expect(await callEndCall(c.a, c.playout)).toBe('');
    expect(isSessionClosing(c.id)).toBe(true);
    expect(c.events.some((e) => e.startsWith('conversation_end goodbye_complete'))).toBe(true);
  });
});

/**
 * A call as prod runs it today (2026-10-19): no CALL_WRAP_UP, PHONE_GOODBYE on,
 * GOODBYE_ENDS_CALL at its default. A fake AgentSession carries the goodbyes;
 * a manual clock runs the timers; every end step lands in `events`.
 */
async function liveCall(opts: { phone?: boolean; env?: Record<string, string> } = {}) {
  const id = sessionId();
  const events: string[] = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  initFrontendSignal(id, async (type, data) => {
    events.push(`${type} ${String(data?.reason)}`);
  });
  const session = new EventEmitter();
  const roomName = `room-${id}`;
  await attachCallWrapUp(agent(), {
    sessionId: id,
    room: { name: roomName, remoteParticipants: { size: 1 } },
    participant: opts.phone ? phoneCaller : appCaller,
    onBehalf: false,
    env: opts.env ?? (opts.phone ? { PHONE_GOODBYE: 'on' } : {}),
    session,
    hangUp: async (room) => void events.push(`deleted ${room}`),
    setTimer: (fn, ms) => void timers.push({ fn, ms }),
    clearTimer: () => undefined,
  });
  const say = (role: 'user' | 'assistant', text: string) =>
    session.emit('conversation_item_added', { item: { type: 'message', role, textContent: text } });
  const agentState = (s: string) => session.emit('agent_state_changed', { newState: s });
  /** Run due timers (a few rounds: the idle end schedules the room close). */
  const runTimers = async () => {
    for (let round = 0; round < 3; round++) {
      timers.splice(0).forEach((t) => t.fn());
      await new Promise((r) => {
        setTimeout(r, 0);
      });
    }
  };
  /** The caller's goodbye, Ferni's goodbye playing, then playout done. */
  const goodbyes = (caller = 'okay, bye!', ferni = 'Bye, take care.') => {
    say('user', caller);
    agentState('speaking');
    say('assistant', ferni);
    agentState('listening');
  };
  return { id, roomName, events, timers, say, agentState, runTimers, goodbyes };
}

describe('saying goodbye ends the call (GOODBYE_ENDS_CALL, default on)', () => {
  it('app call: after both goodbyes have played, the app is told to hang up, then the room closes', async () => {
    const c = await liveCall();
    c.say('user', 'okay, bye!');
    c.agentState('speaking');
    c.say('assistant', 'Bye, take care.');
    expect(c.timers).toHaveLength(0); // never while the goodbye is still playing
    c.agentState('listening');
    expect(c.timers.map((t) => t.ms)).toEqual([IDLE_AFTER_GOODBYE_MS]);
    await c.runTimers();
    expect(c.events).toEqual(['conversation_end idle_after_goodbye', `deleted ${c.roomName}`]);
    expect(isSessionClosing(c.id)).toBe(true);
  });

  it('phone call: the line is hung up (room deleted) straight after the goodbye window', async () => {
    const c = await liveCall({ phone: true });
    c.goodbyes("All right. I'll talk to you later.", 'Sounds good. Talk soon.');
    await c.runTimers();
    expect(c.events).toContain(`deleted ${c.roomName}`);
    expect(isSessionClosing(c.id)).toBe(true);
  });

  it('an explicit "hang up" ends a phone call even when Ferni answers without a goodbye', async () => {
    const c = await liveCall({ phone: true });
    c.goodbyes('I said hang up now. You need to hang up.', "Well, I'm still here.");
    await c.runTimers();
    expect(c.events).toContain(`deleted ${c.roomName}`);
  });

  it('a call with crisis risk on it is never ended by a goodbye; the same goodbye ends a calm call', async () => {
    const calm = await liveCall();
    calm.goodbyes();
    await calm.runTimers();
    expect(calm.events).toContain(`deleted ${calm.roomName}`);

    const crisis = await liveCall();
    noteCrisisRisk(crisis.id);
    crisis.goodbyes('okay, bye', 'Bye. I am right here whenever you need me.');
    await crisis.runTimers();
    expect(crisis.events).toEqual([]);
    expect(isSessionClosing(crisis.id)).toBe(false);
  });

  it('"bye" inside a sentence never ends the call; a real goodbye on the same call does', async () => {
    const c = await liveCall();
    c.goodbyes('I need to say bye to my sister before her flight', 'That is a big send-off.');
    await c.runTimers();
    expect(c.events).toEqual([]);

    c.goodbyes('okay bye', 'Bye!');
    await c.runTimers();
    expect(c.events).toContain(`deleted ${c.roomName}`);
  });

  it('kill switch: GOODBYE_ENDS_CALL=off restores the old behaviour (nothing ends the call)', async () => {
    const c = await liveCall({ env: { GOODBYE_ENDS_CALL: 'off' } });
    c.goodbyes();
    await c.runTimers();
    expect(c.events).toEqual([]);
  });
});
