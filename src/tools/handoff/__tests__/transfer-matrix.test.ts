/**
 * Every transfer, by voice and by tap: "make sure the transfers work, be it voice or
 * the app" (Seth, 2026-10-11, after a dev call where Nayan and Jordan could be reached
 * by neither).
 *
 * For a caller with the whole team open (Partner tier, as EVAL_TIER=partner gives a
 * voice-eval user), from Ferni and from each teammate:
 * - voice: the speaking agent's request carries a handoff tool to every other persona,
 *   back to Ferni included, and the unlock gate the tool runs (checkHandoffUnlocked) opens;
 * - app: a tap's handoff_request goes through the same gate to the orchestrator, with
 *   the canonical id, teammate → teammate and back to Ferni included.
 * For a new free caller, both refuse every locked teammate, the app with a decline text.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { handleHandoffFromDataChannel } from '../../../agents/multi-agent/multi-agent-entry.js';
import { AgentDirectory } from '../../../personas/agent-directory.js';
import { getCanonicalPersonaId } from '../../../personas/voice-registry.js';
import type { UserProfile } from '../../../types/user-profile.js';
import { buildHandoffTools, createHandoffTools } from '../handoff-factory.js';
import { checkHandoffUnlocked } from '../handoff-unlock-check.js';

const TEAM = ['ferni', 'maya-santos', 'peter-john', 'alex-chen', 'jordan-taylor', 'nayan-patel'];
const partner = { id: 'u1', subscription: { tier: 'partner' } } as unknown as UserProfile;
const newcomer = { id: 'u1', totalConversations: 0 } as unknown as UserProfile;

type Orchestrator = Parameters<typeof handleHandoffFromDataChannel>[0];
type Services = Parameters<typeof handleHandoffFromDataChannel>[3];

function orchestratorWith(current: string) {
  const handoff = vi.fn(async () => ({ success: true }));
  const o = {
    isHandoffInProgress: () => false,
    getCurrentPersonaId: () => current,
    handoff,
  } as unknown as Orchestrator;
  return { o, handoff };
}
const services = (profile: UserProfile) =>
  ({ sessionId: 's1', userId: 'u1', userProfile: profile }) as unknown as Services;

/** Every persona with a handoff tool: the core team and the marketplace advisors. */
let everyone: string[] = [];
beforeAll(async () => {
  await AgentDirectory.getEntry('maya-santos'); // the alias table, for canonical ids
  const { tools } = await createHandoffTools();
  everyone = [...new Set(['ferni', ...tools.map((t) => t.agentId)])];
}, 60_000);

const pairs = TEAM.flatMap((from) => TEAM.filter((to) => to !== from).map((to) => [from, to]));

describe('voice: the speaking agent can hand a Partner caller to anyone', () => {
  it.each(TEAM)('from %s, a handoff tool to every other persona', async (from) => {
    const { agentIds } = await buildHandoffTools({
      currentAgentId: from,
      userProfile: partner,
      subscriptionTier: 'partner',
    });
    const reachable = new Set(agentIds);
    const others = everyone.filter((id) => id !== from && id !== 'ferni');
    for (const to of others) expect(reachable, `${from} → ${to}`).toContain(to);
  }, 60_000);

  it.each(pairs)('%s → %s passes the unlock gate the tool runs', (_from, to) => {
    expect(checkHandoffUnlocked(to, partner, 'partner')).toEqual({ open: true, target: to });
  });

  it.each([
    ['Maya', 'maya-santos'],
    ['maya santos', 'maya-santos'],
    ['Peter', 'peter-john'],
    ['Alex', 'alex-chen'],
    ['Jordan', 'jordan-taylor'],
    ['Nayan', 'nayan-patel'],
    ['Ferni', 'ferni'],
  ])('the name "%s" resolves to %s', (name, id) => {
    expect(getCanonicalPersonaId(name.replace(/\s+/g, '-'))).toBe(id);
  });
});

describe('app: a tap reaches the same gate and the orchestrator', () => {
  it.each(pairs)('%s → %s switches, with the canonical id', async (from, to) => {
    const { o, handoff } = orchestratorWith(from);
    const result = await handleHandoffFromDataChannel(o, to, 'tap', services(partner));
    expect(result.success, `${from} → ${to}: ${result.error ?? ''}`).toBe(true);
    expect(handoff).toHaveBeenCalledWith(expect.objectContaining({ targetPersonaId: to }));
  });

  it('a tap on the persona already speaking is refused, not switched', async () => {
    const { o, handoff } = orchestratorWith('maya-santos');
    const result = await handleHandoffFromDataChannel(o, 'maya-santos', 'tap', services(partner));
    expect(result.success).toBe(false);
    expect(handoff).not.toHaveBeenCalled();
  });
});

describe('a new free caller: every locked teammate is refused both ways', () => {
  const locked = TEAM.filter((id) => id !== 'ferni');

  it('voice: no handoff tool to a locked teammate', async () => {
    const { agentIds } = await buildHandoffTools({
      currentAgentId: 'ferni',
      userProfile: newcomer,
      subscriptionTier: 'free',
    });
    for (const id of locked) expect(agentIds).not.toContain(id);
  }, 60_000);

  it.each(locked)('app: a tap on %s is refused with a decline, nothing switches', async (to) => {
    const { o, handoff } = orchestratorWith('ferni');
    const result = await handleHandoffFromDataChannel(o, to, 'tap', services(newcomer));
    expect(result.success).toBe(false);
    expect(result.error?.length ?? 0).toBeGreaterThan(10);
    expect(handoff).not.toHaveBeenCalled();
  });
});
