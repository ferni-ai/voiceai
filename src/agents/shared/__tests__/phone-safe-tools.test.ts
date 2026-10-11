/**
 * A caller recognised by phone alone gets only allowlisted conversational
 * tools: everything else, a tool nobody has classified included, leaves the
 * request and the agent, and a call to one through the SDK's own dispatcher
 * (as agent_activity.js runs it) doesn't execute.
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
import { rememberCallerRecognition } from '../../voice-agent-entry/caller-recognition.js';
import { phoneSafeTool } from '../phone-safe-tools.js';

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

// Account tools the call starts with, one nobody has classified yet, and safe ones.
const NAMES = [
  'cancelSubscription',
  'forgetMemory',
  'getBills',
  'getNotes',
  'manageContact',
  'brandNewAccountTool',
  'getWeather',
  'quickCrisisResources',
];
const SAFE = ['getWeather', 'quickCrisisResources'];

function agentWithTools(): PersonaVoiceAgent {
  return new PersonaVoiceAgent('You are Ferni.', {
    tools: new llm.ToolContext(NAMES.map(tool)) as unknown as llm.ToolContext,
    skipGreeting: true,
  });
}

async function request(agent: PersonaVoiceAgent, sessionId: string): Promise<string[]> {
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: 'Cancel my subscription please.' });
  const tools = await toolsForTurn(
    { userData: { services: { sessionId } } },
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

describe('tools for a phone-recognised caller', () => {
  it('are allowlisted: the rest is out of the request, off the agent, and not executable', async () => {
    rememberCallerRecognition('s-known', { status: 'known', attestation: 'A', userId: 'u1' });
    const agent = agentWithTools();
    const update = vi.spyOn(agent, 'updateTools');

    expect(await request(agent, 's-known')).toEqual(SAFE);
    expect(update).toHaveBeenCalledTimes(1);
    expect(Object.keys(agent.toolCtx.functionTools)).toEqual(SAFE);

    ran.length = 0;
    expect((await dispatch(agent, 'cancelSubscription')).isError).toBe(true);
    expect((await dispatch(agent, 'brandNewAccountTool')).isError).toBe(true);
    expect(ran).toEqual([]);
    expect((await dispatch(agent, 'getWeather')).isError).toBe(false);
    expect(ran).toEqual(['getWeather']);
  });

  it('stay available to an app session and to an unconfirmed (maybe) caller', async () => {
    rememberCallerRecognition('s-maybe', { status: 'maybe', attestation: 'B', name: 'Seth' });
    for (const sessionId of ['s-app', 's-maybe']) {
      const agent = agentWithTools();
      expect(await request(agent, sessionId)).toEqual(NAMES);
      expect(Object.keys(agent.toolCtx.functionTools)).toEqual(NAMES);
    }
  });

  it('deny by default: a tool not on the allowlist is locked', () => {
    for (const name of ['brandNewAccountTool', 'getBills', 'payBill', 'getNotes', 'getReminders']) {
      expect(phoneSafeTool(name)).toBe(false);
    }
    for (const name of ['manageContact', 'rememberAboutUser', 'recallFromMemory', 'findBusiness']) {
      expect(phoneSafeTool(name)).toBe(false);
    }
    for (const name of ['playMusic', 'breatheWithMe', 'quickCrisisResources', 'handoffToPeter']) {
      expect(phoneSafeTool(name)).toBe(true);
    }
  });
});
