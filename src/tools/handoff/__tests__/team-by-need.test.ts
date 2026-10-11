/**
 * TEAM_BY_NEED=on: every teammate is on a brand-new free caller's team, by voice and by
 * tap, and Ferni brings one up only when the conversation calls for them
 * (team-by-need-note.ts). With the flag off, the same caller gets the unlock rules.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { handleHandoffFromDataChannel } from '../../../agents/multi-agent/multi-agent-entry.js';
import { withTurnReminder } from '../../../agents/personas/turn-request.js';
import { buildCameoUnlockContext } from '../../../intelligence/context-builders/team/cameo-unlock.js';
import type { ContextBuilderInput } from '../../../intelligence/context-builders/index.js';
import { AgentDirectory } from '../../../personas/agent-directory.js';
import type { UserProfile } from '../../../types/user-profile.js';
import { buildHandoffTools } from '../handoff-factory.js';
import { checkHandoffUnlocked } from '../handoff-unlock-check.js';
import { answerTeammateRequest, lockedTeammates, unlockViewFor } from '../locked-teammates.js';
import { teamByNeedNote } from '../team-by-need-note.js';

const CORE = ['maya-santos', 'peter-john', 'alex-chen', 'jordan-taylor', 'nayan-patel'];
const LEGENDS = ['john-bogle', 'peter-lynch', 'joel-dickson'];
/** Signed up a minute ago: no conversations, no streak, no subscription. */
const newcomer = { id: 'u1', totalConversations: 0 } as unknown as UserProfile;
const userData = { personaId: 'ferni', services: { userProfile: newcomer } };

// Nobody introduced yet, without Firestore
vi.mock('../../../services/social/team-introductions.js', () => ({
  getIntroducedTeammates: async () => new Set<string>(),
}));

const byNeed = (on: boolean) => vi.stubEnv('TEAM_BY_NEED', on ? 'on' : '');
afterEach(() => vi.unstubAllEnvs());

beforeAll(async () => {
  await AgentDirectory.getEntry('maya-santos'); // the alias table, for canonical ids
}, 60_000);

describe('a brand-new free caller, TEAM_BY_NEED=on', () => {
  it('gets a handoff tool to every core teammate and every legend', async () => {
    byNeed(true);
    const { agentIds } = await buildHandoffTools({
      currentAgentId: 'ferni',
      userProfile: newcomer,
      subscriptionTier: 'free',
    });
    for (const id of [...CORE, ...LEGENDS]) expect(agentIds, id).toContain(id);
  }, 60_000);

  it('is handed to Nayan when they ask by voice: the gate opens, no decline', async () => {
    byNeed(true);
    expect(checkHandoffUnlocked('nayan-patel', newcomer, 'free')).toEqual({
      open: true,
      target: 'nayan-patel',
    });
    const view = unlockViewFor(userData);
    expect(lockedTeammates(view)).toEqual([]);
    const answer = await answerTeammateRequest('Nayan', view);
    expect(answer).toMatchObject({ available: true });
    expect(String(answer.instruction)).toMatch(/call handoffTo\w+ to bring them in/);

    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: 'Can you transfer me to Nayan?' });
    const sent =
      (withTurnReminder(chat, { userData }).items.at(-1) as llm.ChatMessage).textContent ?? '';
    expect(sent).not.toMatch(/not available to this caller/);
  });

  it('is switched to Nayan on a tap', async () => {
    byNeed(true);
    const handoff = vi.fn(async () => ({ success: true }));
    const orchestrator = {
      isHandoffInProgress: () => false,
      getCurrentPersonaId: () => 'ferni',
      handoff,
    } as unknown as Parameters<typeof handleHandoffFromDataChannel>[0];
    const services = {
      sessionId: 's1',
      userId: 'u1',
      userProfile: newcomer,
    } as unknown as Parameters<typeof handleHandoffFromDataChannel>[3];
    const result = await handleHandoffFromDataChannel(orchestrator, 'nayan-patel', 'tap', services);
    expect(result.success, result.error).toBe(true);
    expect(handoff).toHaveBeenCalledWith(
      expect.objectContaining({ targetPersonaId: 'nayan-patel' })
    );
  });
});

describe('the same caller, TEAM_BY_NEED off: the unlock rules as before', () => {
  it('has no handoff tool to a core teammate, and Nayan is declined', async () => {
    byNeed(false);
    const { agentIds } = await buildHandoffTools({
      currentAgentId: 'ferni',
      userProfile: newcomer,
      subscriptionTier: 'free',
    });
    for (const id of CORE) expect(agentIds, id).not.toContain(id);
    expect(checkHandoffUnlocked('nayan-patel', newcomer, 'free').open).toBe(false);
    expect(teamByNeedNote('ferni', 'I have a hard talk with my manager')).toBe('');
  }, 60_000);
});

describe('the per-turn team note', () => {
  it('suggests Alex for a hard talk with a manager, and asks first', () => {
    byNeed(true);
    const note = teamByNeedNote('ferni', 'I have a really hard talk with my manager tomorrow');
    expect(note).toMatch(/fits Alex: .*ask whether they'd like Alex to join/);
    expect(note).toMatch(/ask before transferring, and never push/);
  });

  it('suggests nobody on small talk, and keeps the legends out of it', () => {
    byNeed(true);
    const note = teamByNeedNote('ferni', "hey ferni, how's your day going? the weather is lovely");
    expect(note).toMatch(/^Teammates you can bring in: Maya for .*Nayan for /);
    expect(note).not.toMatch(/fits/);
    expect(note).not.toMatch(/Bogle|Lynch|Dickson/);
  });

  it('doesn\'t take "I\'ve been meaning to" as a call for the sage', () => {
    byNeed(true);
    expect(teamByNeedNote('ferni', "I've been meaning to call my sister")).not.toMatch(/fits/);
    expect(teamByNeedNote('ferni', "what's the point of any of it")).toMatch(/fits Nayan/);
  });

  it('offers a teammate once a call: not again after the agent has named them', () => {
    byNeed(true);
    const said = 'That sounds stressful. Alex is great with this, want me to bring Alex in?';
    expect(teamByNeedNote('ferni', 'my boss again, ugh, the manager thing', said)).not.toMatch(
      /fits Alex/
    );
  });

  it('lists the legends when the caller is talking about investing', () => {
    byNeed(true);
    expect(teamByNeedNote('ferni', 'should I move my 401k into index funds?')).toMatch(
      /legends can join too: John Bogle for .*Peter Lynch for .*Joel Dickson for /
    );
  });

  it("doesn't offer the speaker to itself", () => {
    byNeed(true);
    const note = teamByNeedNote('alex-chen', 'a hard conversation with my boss');
    expect(note).not.toMatch(/Alex/);
  });

  it("reaches the model on the caller's turn (turn-request.ts)", () => {
    byNeed(true);
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: 'I need to have a hard talk with my manager.' });
    const sent =
      (withTurnReminder(chat, { userData }).items.at(-1) as llm.ChatMessage).textContent ?? '';
    expect(sent).toMatch(/fits Alex/);
  });
});

describe('the cameo "you\'ve earned them" introduction', () => {
  it('is off: nobody is introduced for having talked enough', async () => {
    const input = {
      persona: { id: 'ferni' },
      userData: { turnCount: 5 },
      userProfile: { id: 'u1', totalConversations: 100 },
      userText: 'I keep breaking my morning habits and routine',
      analysis: { topics: { detected: ['habit'] } },
      services: {},
    } as unknown as ContextBuilderInput;
    byNeed(false);
    vi.stubEnv('BYPASS_TEAM_UNLOCKS', '');
    expect((await buildCameoUnlockContext(input)).length).toBeGreaterThan(0);
    byNeed(true);
    expect(await buildCameoUnlockContext(input)).toEqual([]);
  });
});
