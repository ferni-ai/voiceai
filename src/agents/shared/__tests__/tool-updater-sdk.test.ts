/**
 * Mid-session tool updates against the real LiveKit Agents SDK.
 *
 * SDK 1.5.1 keeps an agent's tools in a ToolContext (agent.toolCtx) and changes
 * them through agent.updateTools(). The updater used to read and write a private
 * `_tools` field that no longer exists, so every update returned false and the
 * call kept whatever tools it started with.
 */
import { llm, voice } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { getAgentToolCount, getAgentToolNames, updateAgentTools } from '../tool-updater.js';

type UpdaterAgent = Parameters<typeof updateAgentTools>[0];
const makeAgent = (tools: Record<string, ReturnType<typeof makeTool>>) =>
  new voice.Agent({ instructions: 'test', tools }) as unknown as UpdaterAgent &
    voice.Agent<unknown>;

const makeTool = (label: string) =>
  llm.tool({
    description: `test tool ${label}`,
    parameters: z.object({}),
    execute: async () => label,
  });

describe('updateAgentTools on a real SDK agent', () => {
  it('adds new tools to the agent and keeps the existing ones', async () => {
    const agent = makeAgent({ playMusic: makeTool('a') });
    expect(getAgentToolNames(agent)).toEqual(['playMusic']);

    const updated = await updateAgentTools(agent, { recallFromMemory: makeTool('b') });

    expect(updated).toBe(true);
    expect(getAgentToolNames(agent).sort()).toEqual(['playMusic', 'recallFromMemory']);
    expect(getAgentToolCount(agent)).toBe(2);
    // the merged tools must still be callable through the SDK's tool context
    const tool = agent.toolCtx.getFunctionTool('recallFromMemory');
    expect(tool).toBeDefined();
  });

  it('is a no-op when every tool is already registered', async () => {
    const tools = { playMusic: makeTool('a') };
    const agent = makeAgent(tools);
    expect(await updateAgentTools(agent, { playMusic: tools.playMusic })).toBe(true);
    expect(getAgentToolNames(agent)).toEqual(['playMusic']);
  });
});
