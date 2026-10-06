/**
 * The handoffs the first (Ferni) agent is built with, from the real builders:
 * buildHandoffTools for this user plus the essential domains.
 *
 * The essential domains include a "handoff" domain built with no user. Spread
 * over the session's handoffs it put back handoffToFerni (Ferni handing off to
 * itself) and every teammate the user hadn't unlocked, and its handoffToPeter
 * (built last for Peter Lynch) replaced the session's Peter John.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UserProfile } from '../../../types/user-profile.js';
import { buildEssentialToolSet } from '../essential-tool-set.js';

const newFreeUser = { totalConversations: 0 } as UserProfile;
const wholeTeamUser = {
  totalConversations: 400,
  firstContact: new Date(Date.now() - 2 * 365 * 86_400_000).toISOString(),
  subscription: { tier: 'partner' },
} as unknown as UserProfile;

const handoffsFor = async (userProfile: UserProfile) => {
  const { tools } = await buildEssentialToolSet({
    personaId: 'ferni',
    userId: 'test-user',
    services: { userProfile },
  });
  const handoffs = Object.entries(tools).filter(([name]) => name.startsWith('handoffTo'));
  return {
    tools,
    names: handoffs.map(([name]) => name).sort(),
    description: (name: string) =>
      (tools[name] as { description?: string } | undefined)?.description ?? '',
  };
};

describe("the first Ferni agent's handoff tools", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env['BYPASS_TEAM_UNLOCKS'];
    delete process.env['BYPASS_TEAM_UNLOCKS'];
  });
  afterEach(() => {
    if (saved !== undefined) process.env['BYPASS_TEAM_UNLOCKS'] = saved;
  });

  it('gives a new free user no handoffs (every teammate is still locked), but keeps the domain tools', async () => {
    const { tools, names } = await handoffsFor(newFreeUser);
    expect(names).toEqual([]);
    expect(Object.keys(tools)).toContain('playMusic');
    expect(Object.keys(tools)).toContain('recallFromMemory');
    expect(Object.keys(tools)).toContain('softTeamIntro'); // the upsell for locked teammates
  }, 60_000);

  it('never offers Ferni a handoff to itself', async () => {
    expect((await handoffsFor(newFreeUser)).names).not.toContain('handoffToFerni');
    expect((await handoffsFor(wholeTeamUser)).names).not.toContain('handoffToFerni');
  }, 60_000);

  it('gives a user with the whole team unlocked every teammate, Peter going to Peter John', async () => {
    const { names, description } = await handoffsFor(wholeTeamUser);
    expect(names).toEqual([
      'handoffToAlex',
      'handoffToJoel',
      'handoffToJohn',
      'handoffToJordan',
      'handoffToMaya',
      'handoffToNayan',
      'handoffToPeter',
      'handoffToPeterLynch',
    ]);
    expect(description('handoffToPeter')).toMatch(/^Transfer conversation to Peter John, /);
    expect(description('handoffToPeterLynch')).toMatch(/^Transfer conversation to Peter Lynch, /);
  }, 60_000);
});
