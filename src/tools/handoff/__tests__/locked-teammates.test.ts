/**
 * Asked for a teammate who isn't on the caller's team, Ferni says so instead
 * of promising a transfer. Dev call 2026-10-05 (BYPASS_TEAM_UNLOCKS=peter-john):
 * "Transfer me to Maya" got "I'm getting Maya on the line for you right now"
 * and a call to connectToHumanExpert, because nothing in the request said Maya
 * was locked (locked-teammates.ts).
 *
 * Built the way a dev call builds it: Ferni's real handoff tools for the
 * caller, then the request's tools and turn reminder (turn-request.ts), with
 * only Ferni and Peter unlocked.
 */
import { llm } from '@livekit/agents';
import { beforeAll, describe, expect, it } from 'vitest';
import { toolsForTurn, withTurnReminder } from '../../../agents/personas/turn-request.js';
import type { UserProfile } from '../../../types/user-profile.js';
import { executeHandoff } from '../executor.js';
import { buildHandoffTools } from '../handoff-factory.js';

const profile = { subscription: { tier: 'free' } } as unknown as UserProfile;
const session = (personaId = 'ferni') => ({
  userData: { personaId, services: { userProfile: profile } },
});

/** The tools Ferni's request carries on this call. */
async function requestTools(personaId = 'ferni'): Promise<llm.ToolContext> {
  const { tools } = await buildHandoffTools({
    currentAgentId: personaId,
    userProfile: profile,
    subscriptionTier: 'free',
  });
  // A record of anonymous tools, keyed by name, the way agent-setup.ts passes them.
  const toolCtx: llm.ToolContext = new llm.ToolContext(tools as never);
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: 'Transfer me to Maya.' });
  return toolsForTurn(session(personaId), chat, toolCtx, { loggedLockedHandoffs: false });
}

type Answer = Record<string, unknown> & { instruction: string };

async function ask(tools: llm.ToolContext, name: string): Promise<Answer> {
  const tool = tools.functionTools['askForTeammate'] as unknown as {
    execute: (args: { name: string }, opts: unknown) => Promise<Answer>;
  };
  return tool.execute({ name }, { ctx: {}, toolCallId: 't', abortSignal: undefined });
}

/** What the model is told on the caller's turn. */
function reminderFor(personaId = 'ferni'): string {
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: 'Transfer me to Maya.' });
  const sent = withTurnReminder(chat, session(personaId)).items.at(-1) as llm.ChatMessage;
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

  it('replaces the locked handoffs with one askForTeammate tool that names Maya', async () => {
    const tools = await requestTools();
    const names = Object.keys(tools.functionTools);
    expect(names).toContain('handoffToPeter');
    expect(names).toContain('askForTeammate');
    expect(names.filter((n) => n.startsWith('handoffTo'))).toEqual(['handoffToPeter']);
    const { description } = tools.functionTools['askForTeammate'] as { description: string };
    expect(description).toContain('Maya');
    expect(description).not.toContain('Peter');
  }, 60_000);

  it('answers a request for Maya with the warm decline, never a connection', async () => {
    const answer = await ask(await requestTools(), 'Maya');
    expect(answer).toMatchObject({ unavailable: true, teammate: 'Maya' });
    expect(answer.instruction).toContain("Maya isn't on this caller's team yet");
    expect(answer.instruction).toContain('nobody is being connected');
    expect(answer.instruction).toContain('offer to help with it yourself');
    expect(answer).not.toHaveProperty('handoff_complete');
    // The runtime check refuses the transfer itself too.
    expect(await executeHandoff('maya-santos', 'caller asked')).toMatchObject({ locked: true });
  }, 60_000);

  it('still hands off to Peter', async () => {
    const tools = await requestTools();
    expect(tools.functionTools['handoffToPeter']).toBeDefined();
    const answer = await ask(tools, 'Peter');
    expect(answer).toMatchObject({ available: true });
    expect(answer.instruction).toContain('call handoffToPeter');
    const result = await executeHandoff('peter-john', 'caller asked');
    expect(result.locked).toBeFalsy();
  }, 60_000);

  it("never hands Ferni to Ferni, and says it's already Ferni", async () => {
    const tools = await requestTools();
    expect(tools.functionTools['handoffToFerni']).toBeUndefined();
    expect(await ask(tools, 'Ferni')).toMatchObject({ you: true });
  }, 60_000);

  it("from Peter: the hand-back to Ferni stays, Peter isn't offered to himself", async () => {
    const tools = await requestTools('peter-john');
    expect(tools.functionTools['handoffToFerni']).toBeDefined();
    expect(tools.functionTools['handoffToPeter']).toBeUndefined();
    expect(reminderFor('peter-john')).not.toMatch(/team yet:[^.]*Peter/);
    expect(await ask(tools, 'Maya')).toMatchObject({ unavailable: true });
  }, 60_000);
});
