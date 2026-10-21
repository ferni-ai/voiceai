/**
 * Tools that call, text or email other people are offered only to a verified
 * account owner. For an anonymous caller they leave the request and the agent,
 * and a call to one through the SDK's own dispatcher doesn't execute.
 */
import { llm } from '@livekit/agents';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { PersonaVoiceAgent } from '../../personas/ferni-agent.js';
import { toolsForTurn } from '../../personas/turn-request.js';
import { rememberDispatchIdentity } from '../../voice-agent-entry/caller-recognition.js';

const ran: string[] = [];
const tool = (name: string) =>
  llm.tool({
    name,
    description: name,
    parameters: z.object({}),
    execute: async () => {
      ran.push(name);
      return 'done';
    },
  });

const REACH_OTHERS = ['callOnBehalf', 'callAndConverse', 'reachOut', 'multiOutreach', 'quickText'];
const OWN = ['getWeather', 'rememberAboutUser'];
const NAMES = [...REACH_OTHERS, 'sendTextMessage', ...OWN];

function agentWithTools(): PersonaVoiceAgent {
  return new PersonaVoiceAgent('You are Ferni.', {
    tools: new llm.ToolContext(NAMES.map(tool)) as unknown as llm.ToolContext,
    skipGreeting: true,
  });
}

async function request(agent: PersonaVoiceAgent, userId: string, sessionId: string) {
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: 'Can you get my buddy on the line?' });
  const tools = await toolsForTurn(
    { userData: { userId, services: { sessionId } } },
    chat,
    agent.toolCtx as unknown as llm.ToolContext,
    { loggedLockedHandoffs: false, agent }
  );
  return Object.keys(tools.functionTools);
}

/** One tool call through the SDK's dispatcher, against the agent's tools. */
async function dispatch(agent: PersonaVoiceAgent, name: string): Promise<{ isError: boolean }> {
  const dist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));
  const { performToolExecutions } = (await import(
    pathToFileURL(join(dist, 'voice', 'generation.js')).href
  )) as {
    performToolExecutions: (
      opts: unknown
    ) => [
      { result: Promise<unknown> },
      { output: Array<{ toolCallOutput?: { isError: boolean } }> },
    ];
  };
  const call = llm.FunctionCall.create({ callId: 'call-1', name, args: '{}' });
  const [task, out] = performToolExecutions({
    session: { userData: {}, currentAgent: agent },
    speechHandle: { id: 'speech-1', numSteps: 1 },
    toolCtx: agent.toolCtx,
    toolChoice: 'auto',
    toolCallStream: new ReadableStream({
      start(controller) {
        controller.enqueue(call);
        controller.close();
      },
    }),
    controller: new globalThis.AbortController(),
  });
  await task.result;
  return { isError: out.output[0]?.toolCallOutput?.isError ?? true };
}

describe('tools that reach other people', () => {
  it('are not offered to an anonymous caller, and are off the agent and not executable', async () => {
    const agent = agentWithTools();
    const update = vi.spyOn(agent, 'updateTools');

    expect(await request(agent, 'anon:4f1c', 's-anon')).toEqual(OWN);
    expect(update).toHaveBeenCalledTimes(1);
    expect(Object.keys(agent.toolCtx.functionTools)).toEqual(OWN);

    ran.length = 0;
    expect((await dispatch(agent, 'callOnBehalf')).isError).toBe(true);
    expect((await dispatch(agent, 'sendTextMessage')).isError).toBe(true);
    expect(ran).toEqual([]);
    expect((await dispatch(agent, 'getWeather')).isError).toBe(false);
    expect(ran).toEqual(['getWeather']);
  });

  it('are not offered to a signed-in id whose session no dispatch verified', async () => {
    expect(await request(agentWithTools(), 'user-unverified', 's-unverified')).toEqual(OWN);
  });

  it('stay offered to a verified owner (signed-in app dispatch)', async () => {
    rememberDispatchIdentity('s-owner', 'firebase', '{}');
    const agent = agentWithTools();
    expect(await request(agent, 'user-1', 's-owner')).toEqual(NAMES);
    expect(Object.keys(agent.toolCtx.functionTools)).toEqual(NAMES);
  });

  it('stay offered to a test account (it never reaches anyone; evals check the pick)', async () => {
    expect(await request(agentWithTools(), 'voice-eval-1', 's-eval')).toEqual(NAMES);
  });
});
