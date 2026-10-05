/**
 * Asked for a teammate who isn't on the caller's team, Ferni says so instead
 * of promising a transfer (locked-teammates.ts).
 *
 * Built the way a dev call builds it, with only Ferni and Peter unlocked: the
 * first agent's tools from buildEssentialToolSet, capped like agent-setup.ts,
 * given to a real PersonaVoiceAgent; each request's tools and turn reminder
 * from turn-request.ts; and tool calls run through the SDK's own dispatcher
 * (performToolExecutions), against the agent's tools, as a live call runs
 * them. On 17faf85a4 askForTeammate was only declared, and dev heard the SDK
 * answer "Unknown function: askForTeammate".
 */
import { llm } from '@livekit/agents';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildEssentialToolSet } from '../../../agents/multi-agent/essential-tool-set.js';
import { resolveInitialToolLimit } from '../../../agents/multi-agent/initial-tools.js';
import { PersonaVoiceAgent } from '../../../agents/personas/ferni-agent.js';
import { toolsForTurn, withTurnReminder } from '../../../agents/personas/turn-request.js';
import { capToolsToLimit, getMaxTools } from '../../../config/tool-config.js';
import type { UserProfile } from '../../../types/user-profile.js';
import { executeHandoff } from '../executor.js';

const profile = { subscription: { tier: 'free' } } as unknown as UserProfile;
const userDataFor = (personaId = 'ferni') => ({ personaId, services: { userProfile: profile } });

/** The agent a call starts with: essential tools for this caller, capped, in a real agent. */
async function agentFor(personaId = 'ferni'): Promise<PersonaVoiceAgent> {
  const { tools } = await buildEssentialToolSet({
    personaId,
    userId: 'test-user',
    services: { userProfile: profile },
  });
  const capped = capToolsToLimit(tools, resolveInitialToolLimit(getMaxTools()));
  return new PersonaVoiceAgent('You are Ferni.', {
    tools: capped as unknown as llm.ToolContext,
    skipGreeting: true,
  });
}

/** The tools one request carries, from the agent's tools. */
async function requestTools(agent: PersonaVoiceAgent, personaId = 'ferni') {
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: 'Transfer me to Maya.' });
  return toolsForTurn(
    { userData: userDataFor(personaId) },
    chat,
    agent.toolCtx as unknown as llm.ToolContext,
    {
      loggedLockedHandoffs: false,
    }
  );
}

interface Dispatched {
  output: string;
  isError: boolean;
}

/**
 * One tool call through the SDK's dispatcher (voice/generation.js, not exported
 * by the package), with the agent's tool context, as agent_activity.js runs it.
 */
async function dispatch(
  agent: PersonaVoiceAgent,
  name: string,
  args: Record<string, unknown>,
  personaId = 'ferni'
): Promise<Dispatched> {
  const dist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));
  const { performToolExecutions } = (await import(
    pathToFileURL(join(dist, 'voice', 'generation.js')).href
  )) as {
    performToolExecutions: (
      opts: unknown
    ) => [
      { result: Promise<unknown> },
      { output: Array<{ toolCallOutput?: { output: string; isError: boolean } }> },
    ];
  };
  const call = llm.FunctionCall.create({ callId: 'call-1', name, args: JSON.stringify(args) });
  const [task, out] = performToolExecutions({
    session: { userData: userDataFor(personaId), currentAgent: agent },
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
  const result = out.output[0]?.toolCallOutput;
  if (!result) throw new Error('the dispatcher produced no output');
  return result;
}

/** What the model is told on the caller's turn. */
function reminderFor(personaId = 'ferni'): string {
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: 'Transfer me to Maya.' });
  const sent = withTurnReminder(chat, { userData: userDataFor(personaId) }).items.at(
    -1
  ) as llm.ChatMessage;
  return sent.textContent ?? '';
}

describe('teammates the caller has not unlocked (only Ferni and Peter)', () => {
  beforeAll(() => {
    // Parsed once per process (team-unlocks.ts), as on the dev agent.
    process.env['BYPASS_TEAM_UNLOCKS'] = 'peter-john';
  });

  it("tells the model, on the caller's turn, that Maya isn't on their team", () => {
    const text = reminderFor();
    expect(text).toContain("Not on this caller's team yet: Maya, Alex, Jordan and Nayan.");
    expect(text).toMatch(/never offer, promise or start a transfer/);
    expect(text).not.toMatch(/Not on this caller's team yet:[^.]*Peter/);
  });

  it("sends the agent's own askForTeammate, and Peter as the only handoff", async () => {
    const agent = await agentFor();
    const tools = await requestTools(agent);
    const names = Object.keys(tools.functionTools);
    expect(names.filter((n) => n.startsWith('handoffTo'))).toEqual(['handoffToPeter']);
    // The declaration sent is the very tool the agent will execute.
    expect(tools.functionTools['askForTeammate']).toBe(
      agent.toolCtx.getFunctionTool('askForTeammate')
    );
  }, 60_000);

  it('runs askForTeammate("Maya") through the SDK dispatcher: the warm decline', async () => {
    const result = await dispatch(await agentFor(), 'askForTeammate', { name: 'Maya' });
    expect(result.output).not.toContain('Unknown function');
    expect(result.isError).toBe(false);
    expect(result.output).toContain("Maya isn't on this caller's team yet");
    expect(result.output).toContain('nobody is being connected');
    expect(result.output).toContain('offer to help with it yourself');
    // The runtime check refuses the transfer itself too.
    expect(await executeHandoff('maya-santos', 'caller asked')).toMatchObject({ locked: true });
  }, 60_000);

  it('still hands off to Peter', async () => {
    const agent = await agentFor();
    const tools = await requestTools(agent);
    expect(tools.functionTools['handoffToPeter']).toBeDefined();
    const result = await dispatch(agent, 'askForTeammate', { name: 'Peter' });
    expect(result.output).toContain('call handoffToPeter');
    expect((await executeHandoff('peter-john', 'caller asked')).locked).toBeFalsy();
  }, 60_000);

  it("never hands Ferni to Ferni, and says it's already Ferni", async () => {
    const agent = await agentFor();
    expect((await requestTools(agent)).functionTools['handoffToFerni']).toBeUndefined();
    expect((await dispatch(agent, 'askForTeammate', { name: 'Ferni' })).output).toContain(
      'You are Ferni'
    );
  }, 60_000);

  it("from Peter: the hand-back to Ferni stays, Peter isn't offered to himself", async () => {
    const agent = await agentFor('peter-john');
    const tools = await requestTools(agent, 'peter-john');
    expect(tools.functionTools['handoffToFerni']).toBeDefined();
    expect(tools.functionTools['handoffToPeter']).toBeUndefined();
    expect(reminderFor('peter-john')).not.toMatch(/team yet:[^.]*Peter/);
    const result = await dispatch(agent, 'askForTeammate', { name: 'Maya' }, 'peter-john');
    expect(result.output).toContain("Maya isn't on this caller's team yet");
  }, 60_000);

  it("keeps askForTeammate executable through the tool cap's must-keep set", async () => {
    const agent = await agentFor();
    expect(agent.toolCtx.getFunctionTool('askForTeammate')).toBeDefined();
    const tiny = capToolsToLimit({ a: 1, b: 2, askForTeammate: 3 } as Record<string, number>, 1);
    expect(Object.keys(tiny)).toEqual(['askForTeammate']);
  }, 60_000);
});
