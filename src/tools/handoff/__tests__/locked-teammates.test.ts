/**
 * Asked for a teammate who isn't on the caller's team, Ferni says so instead
 * of promising a transfer, and never brings locked teammates up unprompted
 * (locked-teammates.ts).
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
import { Director, setDirector } from '../../../agents/personas/director-notes.js';
import { ASK_FOR_TEAMMATE_DESCRIPTION } from '../locked-teammates.js';

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

/** What the model is told on the caller's turn (crisis-gate.ts sends every reply through this). */
function sentText(chat: llm.ChatContext, session: object): string {
  return (withTurnReminder(chat, session).items.at(-1) as llm.ChatMessage).textContent ?? '';
}

function reminderFor(personaId = 'ferni', words = 'Transfer me to Maya.'): string {
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: words });
  return sentText(chat, { userData: userDataFor(personaId) });
}

/** The dev call's director note after the decline (398674483). */
// A director note that names a locked teammate without guessing motives. The dev
// call's note ("…why they want to escape to Maya") is now dropped by the
// director itself (#368's mind-reading rule); this one is only dropped by the
// locked-teammate filter, which is what this test is about.
const DWELL_NOTE = 'Suggest Maya for their mornings, since routines are her thing.';

describe('teammates the caller has not unlocked (only Ferni and Peter)', () => {
  beforeAll(() => {
    // Parsed once per process (team-unlocks.ts), as on the dev agent.
    process.env['BYPASS_TEAM_UNLOCKS'] = 'peter-john';
  });

  it('names a locked teammate only on the turn the caller names one', () => {
    const asked = reminderFor('ferni', 'Transfer me to Maya.');
    expect(asked).toContain('Maya is on your team but not available to this caller yet, so you can\'t bring Maya in.');
    // Heard as "isn't on the team" it became "Maya's not on our crew" (dev, 2026-10-10).
    expect(asked).toContain("Never say Maya isn't on your team.");
    expect(asked).not.toMatch(/isn't on this caller's team/);
    expect(asked).toMatch(/never offer, promise or start a transfer/);
    expect(asked).not.toMatch(/Alex|Jordan|Nayan/);
    // Any other turn names no locked teammate, and says not to bring them up.
    const other = reminderFor('ferni', 'I really want to work on my morning habits.');
    expect(other).toContain(
      "Of your teammates, only Peter is available to this caller; don't bring up the others."
    );
    expect(other).not.toMatch(/Maya|Alex|Jordan|Nayan/);
    // Whole names only: "Mayan ruins" names no one.
    expect(reminderFor('ferni', 'Tell me about Mayan ruins.')).not.toContain("Maya isn't");
    expect(ASK_FOR_TEAMMATE_DESCRIPTION).toContain('Never bring those teammates up yourself');
    expect(ASK_FOR_TEAMMATE_DESCRIPTION).toContain("don't call this unless the caller named one");
  });

  it("after the decline, the next request is about the caller's question, not Maya", async () => {
    const agent = await agentFor();
    const session = { userData: userDataFor() };
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: 'I really want to work on my morning habits.' });
    chat.addMessage({ role: 'assistant', content: 'Mornings are a puzzle. What gets in the way?' });
    chat.addMessage({ role: 'user', content: 'Transfer me to Maya.' });
    const asked = sentText(chat, session);
    expect(asked).toContain('Maya');
    expect(asked).toMatch(/not available to this caller yet/);

    // The call the model made, run by the SDK, and the decline it spoke.
    const decline = await dispatch(agent, 'askForTeammate', { name: 'Maya' });
    expect(decline.output).toMatch(
      /Then help with what they asked; don't bring this up again unless they do\."\}$/
    );
    chat.insert([
      llm.FunctionCall.create({ callId: 'c1', name: 'askForTeammate', args: '{"name":"Maya"}' }),
      llm.FunctionCallOutput.create({
        callId: 'c1',
        name: 'askForTeammate',
        output: decline.output,
        isError: false,
      }),
    ]);
    chat.addMessage({
      role: 'assistant',
      content: "Maya isn't on your team yet, but I'm right here.",
    });
    chat.addMessage({ role: 'user', content: 'Okay, then what would you suggest I start with?' });

    // The director's note after the decline, as on the dev call.
    const director = new Director({ sessionId: 's', writer: async () => DWELL_NOTE });
    await director.observe([
      { speaker: 'user', text: 'Transfer me to Maya.' },
      { speaker: 'ferni', text: "Maya isn't on your team yet, but I'm right here." },
    ]);
    expect(director.current()).toEqual([DWELL_NOTE]); // the note exists...
    setDirector(session, director);
    const next = sentText(chat, session);
    setDirector(session, null);
    expect(next).toContain('what would you suggest I start with?');
    expect(next).not.toContain('Maya'); // ...and doesn't reach the follow-up
    expect(next).not.toContain('not available to this caller yet');
    expect(next).not.toContain('[Director:');
  }, 60_000);

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
    expect(result.output).toContain("Maya is your teammate but isn't available to this caller yet");
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

  it('never hands Ferni to Ferni, and answers in the first person', async () => {
    const agent = await agentFor();
    expect((await requestTools(agent)).functionTools['handoffToFerni']).toBeUndefined();
    const { output } = await dispatch(agent, 'askForTeammate', { name: 'Ferni' });
    expect(output).toContain("They're already talking to you. Say so in the first person");
    expect(output).toContain("you're talking to me");
    expect(output).not.toMatch(/\b(she|her|he|him|his)\b/i);
  }, 60_000);

  it('from Peter: the hand-back to Ferni stays, and no handoff from Peter to Peter', async () => {
    const agent = await agentFor('peter-john');
    const tools = await requestTools(agent, 'peter-john');
    expect(tools.functionTools['handoffToFerni']).toBeDefined();
    expect(tools.functionTools['handoffToPeter']).toBeUndefined();
    expect(reminderFor('peter-john', 'Hi there.')).toContain(
      "Of your teammates, only Ferni is available to this caller"
    );
    const result = await dispatch(agent, 'askForTeammate', { name: 'Maya' }, 'peter-john');
    expect(result.output).toContain("Maya is your teammate but isn't available to this caller yet");
  }, 60_000);

  it("keeps askForTeammate executable through the tool cap's must-keep set", async () => {
    const agent = await agentFor();
    expect(agent.toolCtx.getFunctionTool('askForTeammate')).toBeDefined();
    const tiny = capToolsToLimit({ a: 1, b: 2, askForTeammate: 3 } as Record<string, number>, 1);
    expect(Object.keys(tiny)).toEqual(['askForTeammate']);
  }, 60_000);
});
