/**
 * Ferni is free while PAYWALL is unset: no upgrade paths, no money prompts, no
 * timed wrap-up of the first conversation. PAYWALL=on restores each of them.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const profiles = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('../../../memory/store-factory.js', () => ({
  getStore: async () => ({
    getProfile: async (id: string) => profiles.get(id) ?? null,
    getOrCreateProfile: async (id: string) => profiles.get(id) ?? { userId: id },
    saveProfile: async (p: { userId: string }) => void profiles.set(p.userId, p),
  }),
}));

import { TEAM_MEMBERS, getTeamMemberUnlockStatus } from '../../social/team-unlocks.js';
import { detect } from '../../monetization/value-capture.js';
import { TRIAL_DURATION_MS, checkTrialStatus } from '../first-taste-trial.js';
import { isPaywallOn, monetizationOptions, withPaywallState, withUpgradePath } from '../paywall.js';

const nayan = TEAM_MEMBERS.find((m) => m.memberId === 'nayan-patel')!;
const NO_METRICS = { totalConversations: 0, daysSinceFirstMeeting: 0 };

function trialUser(id: string, usedMs: number): string {
  profiles.set(id, {
    userId: id,
    trialState: { trialStarted: true, trialCompleted: false, trialTimeUsedMs: usedMs },
  });
  return id;
}

afterEach(() => vi.unstubAllEnvs());

describe('paywall off (the default)', () => {
  it('is off unless PAYWALL=on', () => {
    expect(isPaywallOn({})).toBe(false);
    expect(isPaywallOn({ PAYWALL: 'true' })).toBe(false);
    expect(isPaywallOn({ PAYWALL: 'on' })).toBe(true);
  });

  it('locked teammates name only the relationship path, never an upgrade', () => {
    for (const tier of ['free', 'friend'] as const) {
      const status = getTeamMemberUnlockStatus(nayan, 'first-meeting', tier, NO_METRICS);
      expect(status.unlocked).toBe(false);
      expect(`${status.unlockHint} ${status.requirement}`).not.toMatch(
        /partner tier|become a partner|upgrade/i
      );
    }
  });

  it('the first conversation never announces it is wrapping up', async () => {
    const ended = await checkTrialStatus(trialUser('u-ended', TRIAL_DURATION_MS), 0);
    const lastMinute = await checkTrialStatus(trialUser('u-near', TRIAL_DURATION_MS - 30_000), 0);
    expect(ended.trialEnded).toBe(true);
    expect([ended.showTransition, ended.transitionPrompt]).toEqual([false, null]);
    expect([lastMinute.showTransition, lastMinute.transitionPrompt]).toEqual([false, null]);
  });

  it('status says nobody can upgrade, and config offers no money options', () => {
    expect(withPaywallState({ tier: 'free', canUpgrade: true })).toEqual({
      tier: 'free',
      canUpgrade: false,
      paywall: false,
    });
    expect(Object.values(monetizationOptions()).some(Boolean)).toBe(false);
  });

  it('a money moment is not captured as a reason to ask for a contribution', async () => {
    const event = await detect({
      userId: 'u1',
      message: 'I just got a raise of $5,000!',
      conversationId: 'c1',
    });
    expect(event).toBeNull();
  });
});

describe('PAYWALL=on', () => {
  it('locked teammates offer the paid path again', () => {
    vi.stubEnv('PAYWALL', 'on');
    const free = getTeamMemberUnlockStatus(nayan, 'first-meeting', 'free', NO_METRICS);
    const friend = getTeamMemberUnlockStatus(nayan, 'first-meeting', 'friend', NO_METRICS);
    expect(free.unlockHint).toMatch(/become a Partner/);
    expect(friend.unlockHint).toMatch(/upgrade to Partner tier/);
    expect(withUpgradePath('a', ' or b')).toBe('a or b');
  });

  it('the trial wraps up at its mark', async () => {
    vi.stubEnv('PAYWALL', 'on');
    const ended = await checkTrialStatus(trialUser('u-ended-on', TRIAL_DURATION_MS), 0);
    expect(ended.showTransition).toBe(true);
    expect(ended.transitionPrompt).toBeTruthy();
  });

  it('status keeps canUpgrade and config offers the money options', () => {
    vi.stubEnv('PAYWALL', 'on');
    expect(withPaywallState({ canUpgrade: true })).toEqual({ canUpgrade: true, paywall: true });
    expect(Object.values(monetizationOptions()).every(Boolean)).toBe(true);
  });
});
