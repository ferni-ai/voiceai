/**
 * MENU_TOOLS_PINNED on a real build: the first agent and a handed-to persona get
 * every pinned menu tool past the 64-tool cap, keep every other tool they had,
 * and the per-turn filters still apply to them (turn-request.ts toolsForTurn):
 * a phone-only caller gets only phone-safe ones, a caller who isn't a verified
 * owner nothing that reaches other people, and locked teammates stay locked.
 *
 * Built as agent-setup.ts builds it, and as the tool-cap audit's probe does:
 * buildEssentialToolSet -> filterInitialSpawnTools -> withCallJournalTools ->
 * withAlwaysOnTools -> capToolsToLimit.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { capToolsToLimit, getMaxTools } from '../../../config/tool-config.js';
import { PersonaVoiceAgent } from '../../personas/ferni-agent.js';
import { toolsForTurn } from '../../personas/turn-request.js';
import { phoneSafeTool } from '../../shared/phone-safe-tools.js';
import { rememberCallerRecognition } from '../../voice-agent-entry/caller-recognition.js';
import { THIRD_PARTY_TOOLS } from '../../../tools/registry/outbound-gate.js';
import { initializeToolRegistry } from '../../../tools/registry/loader.js';
import type { UserProfile } from '../../../types/user-profile.js';
import { withCallJournalTools } from '../call-journal-tools.js';
import { buildEssentialToolSet } from '../essential-tool-set.js';
import { withAlwaysOnTools } from '../everyday-basics.js';
import { filterInitialSpawnTools, resolveInitialToolLimit } from '../initial-tools.js';

/** Written out here, not imported: dropping one from the pinned set must fail this file. */
const PINNED = [
  'recordCommitment',
  'getCommitments',
  'completeCommitment',
  'setQuietHours',
  'manageContact',
  'createRoutine',
  'listRoutines',
  'saveContactInfo',
  'startGame',
  'submitGameAnswer',
  'getGameHint',
  'skipGameRound',
  'endGame',
  'getGameStatus',
];
const GAME = PINNED.filter((n) => phoneSafeTool(n));

const profile = { subscription: { tier: 'free' } } as unknown as UserProfile;
const USER = 'menu-pin-user';

async function build(personaId: string, handedTo: boolean): Promise<string[]> {
  const { tools, handoffTools, essentialTools } = await buildEssentialToolSet({
    personaId,
    userId: USER,
    services: { userProfile: profile },
  });
  const named = Object.entries(tools).map(([name, tool]) => ({ name, tool }));
  const filtered = Object.fromEntries(
    filterInitialSpawnTools(
      named,
      new Set(Object.keys(essentialTools)),
      new Set(Object.keys(handoffTools)),
      { essentialOnly: true }
    ).map(({ name, tool }) => [name, tool])
  );
  const ctx = {
    userId: USER,
    sessionId: 'menu-pin',
    agentId: personaId,
    agentDisplayName: personaId,
  };
  const all = await withAlwaysOnTools(await withCallJournalTools(filtered, ctx), ctx, handedTo);
  const limit = resolveInitialToolLimit(getMaxTools());
  return Object.keys(capToolsToLimit(all, limit));
}

async function agentWith(personaId: string): Promise<PersonaVoiceAgent> {
  const { tools } = await buildEssentialToolSet({
    personaId,
    userId: USER,
    services: { userProfile: profile },
  });
  const ctx = {
    userId: USER,
    sessionId: 'menu-pin',
    agentId: personaId,
    agentDisplayName: personaId,
  };
  const all = await withAlwaysOnTools(tools, ctx, false);
  const capped = capToolsToLimit(all, resolveInitialToolLimit(getMaxTools()));
  return new PersonaVoiceAgent('You are Ferni.', {
    tools: capped as unknown as llm.ToolContext,
    skipGreeting: true,
  });
}

async function request(agent: PersonaVoiceAgent, userId: string, sessionId: string) {
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: 'Put that on my day, and transfer me to Maya.' });
  const tools = await toolsForTurn(
    { userData: { userId, personaId: 'ferni', services: { sessionId, userProfile: profile } } },
    chat,
    agent.toolCtx as unknown as llm.ToolContext,
    { loggedLockedHandoffs: false, agent }
  );
  return Object.keys(tools.functionTools);
}

beforeAll(async () => {
  await initializeToolRegistry({ lazyLoading: true });
}, 60_000);
afterEach(() => vi.unstubAllEnvs());

const pinOn = () => {
  vi.stubEnv('MENU_TOOLS_PINNED', 'on');
  vi.stubEnv('PERSIST_AGENT_PROFILES', 'true'); // prod; saveContactInfo needs it
};

describe('MENU_TOOLS_PINNED on a real build', () => {
  it('off: the first agent has none of the tools the cap drops', async () => {
    const off = await build('ferni', false);
    expect(off).toHaveLength(64);
    for (const name of ['recordCommitment', 'setQuietHours', 'createRoutine', 'submitGameAnswer'])
      expect(off, name).not.toContain(name);
  }, 120_000);

  it.each([
    ['ferni', false],
    ['maya', true],
  ] as const)(
    'on: %s has every pinned tool and keeps all it had',
    async (persona, handedTo) => {
      const off = await build(persona, handedTo);
      pinOn();
      const on = await build(persona, handedTo);
      expect(on).toEqual(expect.arrayContaining(PINNED));
      expect(on).toEqual(expect.arrayContaining(off)); // nothing evicted to make room
      // A pinned tool the cap kept anyway frees its slot for the next tool in line.
      const others = on.filter((n) => !PINNED.includes(n));
      expect(others).toEqual(expect.arrayContaining(off.filter((n) => !PINNED.includes(n))));
      expect(others).toHaveLength(64);
    },
    120_000
  );

  it('on, PERSIST_AGENT_PROFILES off: saveContactInfo is not pinned (its write stays in memory)', async () => {
    vi.stubEnv('MENU_TOOLS_PINNED', 'on');
    const on = await build('ferni', false);
    expect(on).not.toContain('saveContactInfo');
    expect(on).toEqual(expect.arrayContaining(PINNED.filter((n) => n !== 'saveContactInfo')));
  }, 120_000);

  it('pins nothing that reaches other people', () => {
    for (const name of PINNED) expect(THIRD_PARTY_TOOLS.has(name), name).toBe(false);
  });
});

describe('MENU_TOOLS_PINNED on: the per-turn filters still apply', () => {
  it('a phone-only caller gets only the phone-safe ones, on the request and the agent', async () => {
    pinOn();
    rememberCallerRecognition('s-pin-known', { status: 'known', attestation: 'A', userId: USER });
    const agent = await agentWith('ferni');
    const sent = await request(agent, USER, 's-pin-known');
    expect(sent.every(phoneSafeTool)).toBe(true);
    expect(sent.filter((n) => PINNED.includes(n)).sort()).toEqual([...GAME].sort());
    expect(Object.keys(agent.toolCtx.functionTools).every(phoneSafeTool)).toBe(true);
  }, 120_000);

  it('an unverified signed-in caller: pinned tools stay, locked teammates and reach-out tools go', async () => {
    pinOn();
    const agent = await agentWith('ferni');
    const sent = await request(agent, USER, 's-pin-unverified');
    expect(sent).toEqual(expect.arrayContaining(PINNED));
    expect(sent.filter((n) => THIRD_PARTY_TOOLS.has(n))).toEqual([]);
    // A new free caller has no teammate unlocked: askForTeammate stands in for every handoff.
    expect(sent.filter((n) => n.startsWith('handoffTo'))).toEqual([]);
    expect(sent).toContain('askForTeammate');
  }, 120_000);
});
