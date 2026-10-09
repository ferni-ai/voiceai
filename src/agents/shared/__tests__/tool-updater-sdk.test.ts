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
import { getEssentialTools } from '../../../config/tool-config.js';
import {
  DEFAULT_INITIAL_TOOL_LIMIT,
  DEFAULT_TOPIC_TOOL_HEADROOM,
} from '../../multi-agent/initial-tools.js';
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

  it("keeps the agent's own handoffs: a shared catalog's handoffs neither replace nor add any", async () => {
    // The agent was built for this user: Peter John is its only handoff.
    const ownPeter = makeTool('peter-john');
    const agent = makeAgent({ handoffToPeter: ownPeter, playMusic: makeTool('a') });

    // The dynamic loader's catalog carries every persona's handoff, Ferni's own
    // included, and its handoffToPeter goes elsewhere.
    await updateAgentTools(agent, {
      handoffToPeter: makeTool('peter-lynch'),
      handoffToFerni: makeTool('ferni'),
      handoffToAlex: makeTool('alex-chen'),
      recallFromMemory: makeTool('b'),
    });

    expect(getAgentToolNames(agent).sort()).toEqual([
      'handoffToPeter',
      'playMusic',
      'recallFromMemory',
    ]);
    expect(agent.toolCtx.getFunctionTool('handoffToPeter')?.description).toBe(
      'test tool peter-john'
    );
  });

  it('is a no-op when every tool is already registered', async () => {
    const tools = { playMusic: makeTool('a') };
    const agent = makeAgent(tools);
    expect(await updateAgentTools(agent, { playMusic: tools.playMusic })).toBe(true);
    expect(getAgentToolNames(agent)).toEqual(['playMusic']);
  });

  it('stays bounded at the initial cap plus topic headroom over repeated updates', async () => {
    // With TOOL_LIMIT unset the update was uncapped: a dev call went
    // 64 -> 160 -> 213 tools (~9.5k prompt tokens, every turn).
    const old = Object.fromEntries(
      Array.from({ length: 64 }, (_, i) => [`oldTool${i}`, makeTool(`o${i}`)])
    );
    const agent = makeAgent(old);
    const bound = DEFAULT_INITIAL_TOOL_LIMIT + DEFAULT_TOPIC_TOOL_HEADROOM;

    for (const topic of ['news', 'recipes', 'travel', 'finance']) {
      const fresh = Object.fromEntries(
        Array.from({ length: 30 }, (_, i) => [`${topic}Tool${i}`, makeTool(`${topic}${i}`)])
      );
      expect(await updateAgentTools(agent, fresh)).toBe(true);

      const names = getAgentToolNames(agent);
      expect(names.length).toBeLessThanOrEqual(bound);
      for (const name of Object.keys(fresh)) expect(names).toContain(name);
    }
  });

  it("makes room for a topic domain's tools when must-keep tools fill the initial cap", async () => {
    // The real first agent: 64 tools, 61 of them must-keep (the essential list
    // plus handoffs). Loading `information` mid-call kept 7 of its 57 tools.
    const mustKeep = [
      ...new Set([
        ...getEssentialTools(),
        'askForTeammate',
        'handoffToMaya',
        'handoffToPeter',
        'handoffToAlex',
        'handoffToJordan',
      ]),
    ];
    expect(mustKeep).toHaveLength(61);
    const initial = Object.fromEntries(
      [...mustKeep, 'getSports', 'getDirections', 'getCommuteTime'].map((n) => [n, makeTool(n)])
    );
    const agent = makeAgent(initial);
    expect(getAgentToolCount(agent)).toBe(DEFAULT_INITIAL_TOOL_LIMIT);

    const topic = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`infoTool${i}`, makeTool(`info${i}`)])
    );
    expect(await updateAgentTools(agent, topic)).toBe(true);

    const names = getAgentToolNames(agent);
    const landed = Object.keys(topic).filter((n) => names.includes(n));
    expect(landed.length).toBeGreaterThanOrEqual(Math.min(20, DEFAULT_TOPIC_TOOL_HEADROOM));
    for (const name of mustKeep) expect(names).toContain(name);
    expect(names.length).toBeLessThanOrEqual(
      DEFAULT_INITIAL_TOOL_LIMIT + DEFAULT_TOPIC_TOOL_HEADROOM
    );
  });
});
