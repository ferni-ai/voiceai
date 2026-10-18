/**
 * ALEX_CHIEF_OF_STAFF: Alex keeps the caller's todos, goals, calendar and agenda,
 * and Ferni hands planning to him (config/alex-chief-of-staff-flag.ts).
 *
 * Off, a brand-new free caller gets exactly the unlock rules, the turn note and
 * the handoff tools they had. On for one caller (their cohort flags, applied at
 * call start), Alex is on their team at stage 0, and only Alex; Ferni's turn
 * note and his handoff tool for Alex name Alex for planning; and the ask-first
 * gate lets a yes to that offer through.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { handleHandoffFromDataChannel } from '../../../agents/multi-agent/multi-agent-entry.js';
import { withTurnReminder } from '../../../agents/personas/turn-request.js';
import { AgentDirectory } from '../../../personas/agent-directory.js';
import {
  applyCallerFlags,
  forgetAgentValues,
  type CohortStore,
} from '../../../services/platform/cohort-flags.js';
import { getTeamUnlockState } from '../../../services/social/team-unlocks.js';
import type { UserProfile } from '../../../types/user-profile.js';
import { PLANNING_NEED, chiefOfStaffNote } from '../chief-of-staff-note.js';
import { buildHandoffTools } from '../handoff-factory.js';
import { handoffConsent } from '../handoff-consent.js';
import { checkHandoffUnlocked } from '../handoff-unlock-check.js';
import { teamByNeedNote } from '../team-by-need-note.js';

/** Signed up a minute ago: no conversations, no streak, no subscription. */
const newcomer = { id: 'seth', totalConversations: 0 } as unknown as UserProfile;
const userData = { personaId: 'ferni', services: { userProfile: newcomer } };

vi.mock('../../../services/social/team-introductions.js', () => ({
  getIntroducedTeammates: async () => new Set<string>(),
}));

/** Seth's cohort sets the flag; everyone else has none. */
const store: CohortStore = {
  cohortsFor: async (uid) =>
    uid === 'seth' ? [{ id: 'seth', enabled: true, flags: { ALEX_CHIEF_OF_STAFF: 'on' } }] : [],
  overridesFor: async () => ({}),
};
const callFrom = (uid: string) => applyCallerFlags(uid, { store, timeoutMs: 2_000 });

beforeAll(async () => {
  await AgentDirectory.getEntry('maya-santos'); // the alias table, for canonical ids
}, 60_000);
afterEach(() => {
  vi.unstubAllEnvs();
  forgetAgentValues();
  delete process.env.ALEX_CHIEF_OF_STAFF;
});

function sentReminder(said: string, ferniBefore?: string): string {
  const chat = llm.ChatContext.empty();
  if (ferniBefore) chat.addMessage({ role: 'assistant', content: ferniBefore });
  chat.addMessage({ role: 'user', content: said });
  return (withTurnReminder(chat, { userData }).items.at(-1) as llm.ChatMessage).textContent ?? '';
}

async function alexTool(): Promise<{ description?: string } | undefined> {
  const { tools } = await buildHandoffTools({
    currentAgentId: 'ferni',
    userProfile: newcomer,
    subscriptionTier: 'free',
  });
  return tools.handoffToAlex as { description?: string } | undefined;
}

describe('flag off: a brand-new free caller, as before', () => {
  it('has Ferni alone, no handoff tool to Alex, and Alex refused by voice and by tap', async () => {
    vi.stubEnv('TEAM_BY_NEED', '');
    vi.stubEnv('BYPASS_TEAM_UNLOCKS', '');
    expect(getTeamUnlockState(newcomer).unlockedMembers).toEqual(['ferni']);
    expect(await alexTool()).toBeUndefined();
    expect(checkHandoffUnlocked('alex-chen', newcomer, 'free')).toMatchObject({ open: false });
  }, 60_000);

  it('adds no planning line to the turn, and the TEAM_BY_NEED line names Alex as before', () => {
    vi.stubEnv('TEAM_BY_NEED', 'on');
    expect(chiefOfStaffNote('ferni', "what's on my calendar today?")).toBe('');
    const sent = sentReminder("what's on my calendar today?");
    expect(sent).not.toMatch(/chief of staff/);
    expect(teamByNeedNote('ferni', 'hi')).toContain(
      'Alex for hard conversations, email, texts and calendar;'
    );
  });

  it("leaves Alex's handoff tool description as the manifest gives it", async () => {
    vi.stubEnv('TEAM_BY_NEED', 'on'); // so the tool exists for a newcomer
    expect((await alexTool())?.description).toMatch(/^Transfer conversation to Alex Chen[^]*\.$/);
    expect((await alexTool())?.description).not.toMatch(/chief of staff/);
  }, 60_000);
});

describe("flag on for one caller (Seth's cohort, applied at call start)", () => {
  it('opens Alex at stage 0, and only Alex, by voice and by tap', async () => {
    vi.stubEnv('COHORT_FLAGS', 'on');
    vi.stubEnv('TEAM_BY_NEED', '');
    vi.stubEnv('BYPASS_TEAM_UNLOCKS', '');
    expect(await callFrom('seth')).toEqual(['ALEX_CHIEF_OF_STAFF']);

    const state = getTeamUnlockState(newcomer);
    expect(state.stage).toBe('first-meeting');
    expect(state.unlockedMembers).toEqual(['ferni', 'alex-chen']);
    expect(checkHandoffUnlocked('alex-chen', newcomer, 'free')).toEqual({
      open: true,
      target: 'alex-chen',
    });
    expect(checkHandoffUnlocked('maya-santos', newcomer, 'free').open).toBe(false);
    const { agentIds } = await buildHandoffTools({
      currentAgentId: 'ferni',
      userProfile: newcomer,
      subscriptionTier: 'free',
    });
    expect(agentIds).toContain('alex-chen');
    expect(agentIds).not.toContain('maya-santos');

    const handoff = vi.fn(async () => ({ success: true }));
    const orchestrator = {
      isHandoffInProgress: () => false,
      getCurrentPersonaId: () => 'ferni',
      getActiveAgent: () => null,
      handoff,
    } as unknown as Parameters<typeof handleHandoffFromDataChannel>[0];
    const services = {
      sessionId: 's1',
      userId: 'seth',
      userProfile: newcomer,
    } as unknown as Parameters<typeof handleHandoffFromDataChannel>[3];
    const tap = await handleHandoffFromDataChannel(orchestrator, 'alex-chen', 'tap', services);
    expect(tap.success, tap.error).toBe(true);
  }, 60_000);

  it("the next caller, in no cohort, gets the agent's own values back", async () => {
    vi.stubEnv('COHORT_FLAGS', 'on');
    vi.stubEnv('TEAM_BY_NEED', '');
    vi.stubEnv('BYPASS_TEAM_UNLOCKS', '');
    await callFrom('seth');
    await callFrom('someone-else');
    expect(getTeamUnlockState(newcomer).unlockedMembers).toEqual(['ferni']);
  });

  it("sends planning to Alex on Ferni's turn, and asks first", async () => {
    vi.stubEnv('COHORT_FLAGS', 'on');
    await callFrom('seth');
    const sent = sentReminder("what's on my calendar today?");
    expect(sent).toMatch(/Alex is the caller's chief of staff: their todos, goals, calendar/);
    expect(sent).toMatch(/offer him in a few words, like "Want me to grab Alex\?/);
    expect(sent).toMatch(/hand off once they say yes/);
    expect(sent).toMatch(/What they just said is planning: offer Alex now\./);
  });

  it('keeps a quick reminder with Ferni, and offers no handoff for it', async () => {
    vi.stubEnv('COHORT_FLAGS', 'on');
    await callFrom('seth');
    const note = chiefOfStaffNote('ferni', 'remind me to call mom at five');
    expect(note).toMatch(/A quick one-off reminder or timer, you set yourself\./);
    expect(note).not.toMatch(/offer Alex now/);
  });

  it("doesn't push Alex again right after Ferni offered him, and Alex gets no note", async () => {
    vi.stubEnv('COHORT_FLAGS', 'on');
    await callFrom('seth');
    const offered = 'Want me to grab Alex? He keeps your schedule.';
    expect(chiefOfStaffNote('ferni', 'what do i have today', offered)).not.toMatch(
      /offer Alex now/
    );
    expect(chiefOfStaffNote('alex-chen', "what's on my calendar today?")).toBe('');
  });

  it("names Alex's role on his handoff tool", async () => {
    vi.stubEnv('COHORT_FLAGS', 'on');
    await callFrom('seth');
    expect((await alexTool())?.description).toMatch(
      /He is the caller's chief of staff: hand off to him for their todos, goals, calendar, schedule and agenda\.$/
    );
  }, 60_000);

  it('names Alex for planning in the TEAM_BY_NEED line too', async () => {
    vi.stubEnv('COHORT_FLAGS', 'on');
    vi.stubEnv('TEAM_BY_NEED', 'on');
    await callFrom('seth');
    expect(teamByNeedNote('ferni', 'hi')).toContain(
      'Alex for todos, goals, calendar and agenda (their chief of staff), and hard conversations'
    );
    expect(teamByNeedNote('alex-chen', 'hi')).not.toMatch(/Alex/);
  });

  it("lets the caller's yes to that offer through the HANDOFF_ASK_FIRST gate", () => {
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: "what's on my plate this week?" });
    chat.addMessage({
      role: 'assistant',
      content: 'Want me to grab Alex? He keeps your schedule.',
    });
    chat.addMessage({ role: 'user', content: 'yeah, sure' });
    expect(handoffConsent(chat, 'Alex Chen')).toBe('agreed');
  });
});

describe('what counts as planning', () => {
  it.each([
    "what's on my calendar today?",
    'add a task to call the plumber',
    "what's on my plate this week",
    "let's do my week",
    'can we do a weekly review',
    'how am I doing on my goals',
    'what do i have tomorrow',
    'I need to schedule a dentist appointment',
  ])('"%s" is planning', (said) => {
    expect(PLANNING_NEED.test(said.toLowerCase())).toBe(true);
  });

  it.each([
    'remind me to call mom at five',
    'set a timer for ten minutes',
    'my day was rough',
    'he scored the winning goal last night',
    'my sleep schedule is a mess',
  ])('"%s" is not', (said) => {
    expect(PLANNING_NEED.test(said.toLowerCase())).toBe(false);
  });
});
