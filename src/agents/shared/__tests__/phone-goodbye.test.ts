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
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PersonaVoiceAgent } from '../../personas/ferni-agent.js';
import { attachPhoneHangUp, END_CALL } from '../phone-goodbye.js';

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

describe('phone goodbye', () => {
  it('gives a phone caller endCall, which hangs up after the goodbye plays', async () => {
    const a = agent();
    const events: string[] = [];
    const hangUp = async (room: string) => void events.push(`hung up ${room}`);
    const added = await attachPhoneHangUp(a, {
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
      expect(await attachPhoneHangUp(a, { roomName: 'r', ...c })).toBe(false);
      expect(names(a)).toEqual(before);
    }
  });
});
