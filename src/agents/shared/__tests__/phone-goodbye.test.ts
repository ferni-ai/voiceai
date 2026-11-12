/**
 * PHONE_GOODBYE: a phone caller's agent gets endCall, and calling it through
 * the SDK's own dispatcher (as agent_activity.js runs tools) lets the goodbye
 * finish playing, then hangs up the call's room.
 */
import { llm } from '@livekit/agents';
import { ParticipantKind } from '@livekit/rtc-node';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const { phoneLog } = vi.hoisted(() => ({ phoneLog: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (bindings: Record<string, unknown>) => {
      const logger = real.createLogger(bindings);
      if (bindings.module !== 'phone-goodbye') return logger;
      const record = (o: unknown, msg?: string) => phoneLog(msg, o);
      return { ...logger, info: record, warn: record };
    },
  };
});
import {
  noteCrisisRisk,
  resetCrisisCallRisk,
  trackCrisisRead,
} from '../../../services/safety/crisis-call-risk.js';
import { PersonaVoiceAgent } from '../../personas/ferni-agent.js';
import { MINOR_CARE_HOLD } from '../minor-care-end-hold.js';
import { attachPhoneHangUp, CRISIS_HOLD, END_CALL } from '../phone-goodbye.js';
import {
  firestoreHoldStore,
  setHoldStore,
} from '../../../services/outreach/minor-care-shared-hold.js';
import { bindSessionUser, holdSession, resetMinorCare } from '../../../utils/minor-care.js';

const ON = { PHONE_GOODBYE: 'on' };
const phoneCaller = { kind: ParticipantKind.SIP };
const appCaller = { kind: ParticipantKind.STANDARD };

function agent(extra: string[] = []): PersonaVoiceAgent {
  const tool = (name: string) =>
    llm.tool({ name, description: name, parameters: z.object({}), execute: async () => 'ok' });
  return new PersonaVoiceAgent('You are Ferni.', {
    tools: new llm.ToolContext(['getWeather', ...extra].map(tool)) as unknown as llm.ToolContext,
    skipGreeting: true,
  });
}

const names = (a: PersonaVoiceAgent) => Object.keys(a.toolCtx.functionTools);

/** endCall through the SDK's dispatcher; `events` records playout and hang-up order. */
async function callEndCall(
  a: PersonaVoiceAgent,
  events: string[],
  playout: () => Promise<void> = async () => void events.push('goodbye played')
): Promise<string> {
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

afterEach(() => {
  phoneLog.mockReset();
  resetCrisisCallRisk();
});
const attached = () => phoneLog.mock.calls.filter(([msg]) => msg === 'PHONE_GOODBYE_ATTACHED');

describe('phone goodbye', () => {
  it('reads the flag like every other flag: on, true and 1 attach endCall and log it once', async () => {
    for (const value of ['on', 'true', '1', 'TRUE']) {
      phoneLog.mockReset();
      const a = agent();
      const call = { sessionId: 's-1', roomName: 'r', participant: phoneCaller, onBehalf: false };
      expect(await attachPhoneHangUp(a, { ...call, env: { PHONE_GOODBYE: value } })).toBe(true);
      expect(names(a)).toEqual(['getWeather', END_CALL]);
      // A second attach on the same call adds nothing and logs nothing
      expect(await attachPhoneHangUp(a, { ...call, env: { PHONE_GOODBYE: value } })).toBe(false);
      expect(attached()).toEqual([['PHONE_GOODBYE_ATTACHED', { sessionId: 's-1' }]]);
    }
    for (const value of ['off', 'false', '0', 'yes']) {
      phoneLog.mockReset();
      const a = agent();
      const call = { sessionId: 's-2', roomName: 'r', participant: phoneCaller, onBehalf: false };
      expect(await attachPhoneHangUp(a, { ...call, env: { PHONE_GOODBYE: value } })).toBe(false);
      expect(attached()).toEqual([]);
    }
  });

  it('gives a phone caller endCall, which hangs up after the goodbye plays', async () => {
    const a = agent();
    const events: string[] = [];
    const hangUp = async (room: string) => void events.push(`hung up ${room}`);
    const added = await attachPhoneHangUp(a, {
      sessionId: 's-room-1',
      roomName: 'room-1',
      participant: phoneCaller,
      onBehalf: false,
      env: ON,
      hangUp,
    });
    expect(added).toBe(true);
    expect(names(a)).toEqual(['getWeather', END_CALL]);

    expect(await callEndCall(a, events)).toContain('The call has ended.');
    expect(events).toEqual(['goodbye played', 'hung up room-1']);
  });

  it('still hangs up when playout fails, and says so when the hang-up fails', async () => {
    const events: string[] = [];
    const a = agent();
    await attachPhoneHangUp(a, {
      sessionId: 's-room-2',
      roomName: 'room-2',
      participant: phoneCaller,
      onBehalf: false,
      env: ON,
      hangUp: async (room) => void events.push(`hung up ${room}`),
    });
    await callEndCall(a, events, async () => {
      throw new Error('interrupted');
    });
    expect(events).toEqual(['hung up room-2']);

    const b = agent();
    await attachPhoneHangUp(b, {
      sessionId: 's-room-3',
      roomName: 'room-3',
      participant: phoneCaller,
      onBehalf: false,
      env: ON,
      hangUp: async () => {
        throw new Error('no credentials');
      },
    });
    expect(await callEndCall(b, [])).toMatch(/didn't drop/);
  });

  it('leaves app callers, on-behalf calls, the flag off and an existing endCall alone', async () => {
    const cases = [
      { participant: appCaller, onBehalf: false, env: ON, extra: [] },
      { participant: phoneCaller, onBehalf: true, env: ON, extra: [] },
      { participant: phoneCaller, onBehalf: false, env: {}, extra: [] },
      { participant: phoneCaller, onBehalf: false, env: ON, extra: [END_CALL] },
    ];
    for (const c of cases) {
      const a = agent(c.extra);
      const before = names(a);
      expect(await attachPhoneHangUp(a, { sessionId: 's-r', roomName: 'r', ...c })).toBe(false);
      expect(names(a)).toEqual(before);
    }
  });
});

/** A phone caller's agent with endCall (PHONE_GOODBYE on); `events` records playout and hang-up. */
async function phoneCall(sessionId: string) {
  const a = agent();
  const events: string[] = [];
  await attachPhoneHangUp(a, {
    sessionId,
    roomName: `room-${sessionId}`,
    participant: phoneCaller,
    onBehalf: false,
    env: ON,
    hangUp: async (room) => void events.push(`hung up ${room}`),
  });
  return { a, events };
}

describe('phone goodbye on a call with crisis risk', () => {
  const held = () => phoneLog.mock.calls.filter(([msg]) => msg === 'END_CALL_HELD_CRISIS');

  it('does not hang up once crisis risk is noted, and tells Ferni to stay', async () => {
    const { a, events } = await phoneCall('s-crisis');
    noteCrisisRisk('s-crisis');
    expect(await callEndCall(a, events)).toBe(JSON.stringify(CRISIS_HOLD));
    expect(events.some((e) => e.startsWith('hung up'))).toBe(false);
    expect(held()).toEqual([
      ['END_CALL_HELD_CRISIS', { sessionId: 's-crisis', tool: 'phone', stage: 'before_playout' }],
    ]);
  });

  it('holds while a crisis read is still in flight, and hangs up once it reads clean', async () => {
    const { a, events } = await phoneCall('s-reading');
    let finish: (v: { risk: string }) => void = () => {};
    const read = trackCrisisRead(
      's-reading',
      'turn',
      new Promise<{ risk: string }>((resolve) => {
        finish = resolve;
      })
    );
    expect(await callEndCall(a, events)).toBe(JSON.stringify(CRISIS_HOLD));
    expect(events.some((e) => e.startsWith('hung up'))).toBe(false);

    finish({ risk: 'none' });
    await read;
    expect(await callEndCall(a, events)).toContain('The call has ended.');
    expect(events).toEqual(['goodbye played', 'hung up room-s-reading']);
  });

  it('does not hang up when crisis risk is noted while the goodbye plays', async () => {
    const { a, events } = await phoneCall('s-mid-goodbye');
    const output = await callEndCall(a, events, async () => {
      events.push('goodbye played');
      noteCrisisRisk('s-mid-goodbye');
    });
    expect(output).toBe(JSON.stringify(CRISIS_HOLD));
    expect(events).toEqual(['goodbye played']);
    expect(held()).toEqual([
      [
        'END_CALL_HELD_CRISIS',
        { sessionId: 's-mid-goodbye', tool: 'phone', stage: 'after_playout' },
      ],
    ]);
  });

  it('hangs up as before when the call has no risk, even if another call does', async () => {
    noteCrisisRisk('s-other-call');
    const { a, events } = await phoneCall('s-calm');
    expect(await callEndCall(a, events)).toContain('The call has ended.');
    expect(events).toEqual(['goodbye played', 'hung up room-s-calm']);
    expect(held()).toEqual([]);
  });
});

describe('phone goodbye for a care-held minor', () => {
  beforeEach(() => {
    vi.stubEnv('MINOR_CARE', 'on');
    vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
    setHoldStore({ heldUntil: async () => undefined, write: async () => {} });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetMinorCare();
    setHoldStore(firestoreHoldStore);
  });
  const held = () => phoneLog.mock.calls.filter(([msg]) => msg === 'END_CALL_HELD_MINOR_CARE');

  it("does not hang up on this session's minor-care hold, and tells Ferni to stay", async () => {
    const { a, events } = await phoneCall('s-minor');
    bindSessionUser('s-minor', 'eval-held-teen');
    holdSession('s-minor');
    expect(await callEndCall(a, events)).toBe(JSON.stringify(MINOR_CARE_HOLD));
    expect(events).toEqual(['goodbye played']);
    expect(held()).toEqual([
      ['END_CALL_HELD_MINOR_CARE', { sessionId: 's-minor', why: 'minor_care' }],
    ]);
  });

  it("does not hang up when the caller's account is held elsewhere (shared record)", async () => {
    const { a, events } = await phoneCall('s-minor-account');
    bindSessionUser('s-minor-account', 'eval-held-teen-2');
    setHoldStore({ heldUntil: async () => Date.now() + 60_000, write: async () => {} });
    expect(await callEndCall(a, events)).toBe(JSON.stringify(MINOR_CARE_HOLD));
    expect(events).toEqual(['goodbye played']);
  });

  it('does not hang up when the hold lands while the goodbye plays', async () => {
    const { a, events } = await phoneCall('s-minor-late');
    bindSessionUser('s-minor-late', 'eval-late-teen');
    const output = await callEndCall(a, events, async () => {
      events.push('goodbye played');
      holdSession('s-minor-late');
    });
    expect(output).toBe(JSON.stringify(MINOR_CARE_HOLD));
    expect(events).toEqual(['goodbye played']);
  });

  it('hangs up an adult as before, reading the hold while the goodbye plays', async () => {
    const { a, events } = await phoneCall('s-adult');
    bindSessionUser('s-adult', 'eval-adult');
    setHoldStore({
      heldUntil: async () => void events.push('hold read'),
      write: async () => {},
    });
    const output = await callEndCall(a, events, async () => {
      await new Promise((r) => {
        setTimeout(r, 0);
      });
      events.push('goodbye played');
    });
    expect(output).toContain('The call has ended.');
    expect(events).toEqual(['hold read', 'goodbye played', 'hung up room-s-adult']);
    expect(held()).toEqual([]);
  });
});
