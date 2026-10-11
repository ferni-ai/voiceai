/**
 * TOOL_CORE_STATIC + findTools on a real SDK AgentSession (FakeLLM): a tool
 * findTools finds is callable in the same reply, one extra LLM step, and stays
 * on the agent for the rest of the call. The agent's llmNode goes through the
 * production toolsForTurn, like PersonaVoiceAgent's.
 */
import { initializeLogger, llm, voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toolsForTurn, type TurnToolsState } from '../../personas/turn-request.js';
import {
  createFindToolsTool,
  FIND_TOOLS,
  setToolPinner,
} from '../../../tools/retrieval/find-tools-tool.js';
import {
  setTurnToolRetrieval,
  type TurnToolRetrieval,
} from '../../../tools/retrieval/turn-tool-retrieval.js';
import { createToolPinner, staticCoreTools } from '../static-core-tools.js';

initializeLogger({ pretty: false, level: 'warn' });

const saved = { ...process.env };
beforeEach(() => {
  process.env.TOOL_CORE_STATIC = 'on';
});
afterEach(() => {
  process.env = { ...saved };
});

const ran: string[] = [];
const tool = (name: string, result = `${name} done`) =>
  llm.tool({
    description: `${name}: does what its name says.`,
    parameters: z.object({}),
    execute: async () => {
      ran.push(name);
      return result;
    },
  });

// findTools' reply; tool outputs reach the model (FakeLLM's lookup key) as JSON strings.
const FOUND =
  'These tools are now available; call the one that fits: lighthouseBeam (lighthouseBeam: does what its name says.)';

class CoreAgent extends voice.Agent {
  readonly state: TurnToolsState = { loggedLockedHandoffs: false, agent: this };
  /** The tool names each LLM request carried, in order. */
  readonly requests: string[][] = [];
  async llmNode(
    chatCtx: llm.ChatContext,
    toolCtx: llm.ToolContext,
    modelSettings: voice.ModelSettings
  ): ReturnType<voice.Agent['llmNode']> {
    const tools = await toolsForTurn(this.session as never, chatCtx, toolCtx, this.state);
    this.requests.push(Object.keys(tools.functionTools));
    return super.llmNode(chatCtx, tools, modelSettings);
  }
}

async function startCall(responses: voice.testing.FakeLLMResponse[]) {
  ran.length = 0;
  const core = await staticCoreTools(
    {
      playMusic: tool('playMusic'),
      quickTimer: tool('quickTimer'),
      [FIND_TOOLS]: createFindToolsTool(),
    },
    { userId: 'u', agentId: 'ferni', agentDisplayName: 'Ferni' },
    async () => ({})
  );
  const agent = new CoreAgent({ instructions: 'You are Ferni.', tools: core as never });
  const session = new voice.AgentSession({
    llm: new voice.testing.FakeLLM(responses),
    userData: {},
  });
  // findTools' search, stubbed: the catalog's best match for any need.
  setTurnToolRetrieval(session, {
    find: async () => [{ name: 'lighthouseBeam', description: '' }],
  } as unknown as TurnToolRetrieval);
  setToolPinner(
    session,
    createToolPinner(
      () => agent,
      { userId: 'u', agentId: 'ferni', agentDisplayName: 'Ferni' },
      async (names) => Object.fromEntries(names.map((n) => [n, tool(n, 'beam on')]))
    )
  );
  await session.start({ agent });
  return { agent, session };
}

describe('TOOL_CORE_STATIC findTools, same turn', () => {
  it('a found tool is called in the same reply, at the cost of one extra LLM step', async () => {
    const { agent, session } = await startCall([
      {
        input: 'turn the lighthouse beam on',
        toolCalls: [{ name: FIND_TOOLS, args: { need: 'lighthouse beam' } }],
      },
      { input: JSON.stringify(FOUND), toolCalls: [{ name: 'lighthouseBeam', args: {} }] },
      { input: JSON.stringify('beam on'), content: 'It is on.' },
      { input: 'start a timer', toolCalls: [{ name: 'quickTimer', args: {} }] },
      { input: JSON.stringify('quickTimer done'), content: 'Timer is going.' },
    ]);
    const before = Object.keys(agent.toolCtx.functionTools);
    expect(before).not.toContain('lighthouseBeam');

    await session.run({ userInput: 'turn the lighthouse beam on' }).wait();
    expect(ran).toEqual(['lighthouseBeam']);
    // findTools step, the found tool's step, the spoken reply.
    expect(agent.requests).toHaveLength(3);
    expect(agent.requests[0]).not.toContain('lighthouseBeam');
    expect(agent.requests[1]).toContain('lighthouseBeam');

    // A core tool: its step and the spoken reply, one fewer.
    const sentBefore = agent.requests.length;
    await session.run({ userInput: 'start a timer' }).wait();
    expect(ran).toEqual(['lighthouseBeam', 'quickTimer']);
    expect(agent.requests.length - sentBefore).toBe(2);

    // Sticky: appended after the call's set, which is unchanged in front.
    const after = Object.keys(agent.toolCtx.functionTools);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.at(-1)).toBe('lighthouseBeam');
    expect(agent.requests.at(-1)).toContain('lighthouseBeam');
    await session.close();
  });
});
