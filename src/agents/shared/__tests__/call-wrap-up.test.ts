/**
 * CALL_WRAP_UP: an app caller's agent gets endCall, and calling it through the
 * SDK's own dispatcher lets the goodbye finish, marks the call closing, sends
 * the app conversation_end, then deletes the room if the caller is still in it.
 */
import { llm } from '@livekit/agents';
import { ParticipantKind } from '@livekit/rtc-node';
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
import { END_CALL } from '../phone-goodbye.js';
import { clearSessionClosing, isSessionClosing } from '../session-closing-tracker.js';
import {
  resetFrontendSignal,
  initFrontendSignal,
} from '../../../services/communication/frontend-signal.js';

const ON = { CALL_WRAP_UP: 'on' };
const appCaller = { kind: ParticipantKind.STANDARD };
const phoneCaller = { kind: ParticipantKind.SIP };

const used: string[] = [];
afterEach(() => {
  used.splice(0).forEach((id) => clearSessionClosing(id));
  resetFrontendSignal();
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
    expect(WRAP_UP_DESCRIPTION).toMatch(/never on a heavy or crisis call/);
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
