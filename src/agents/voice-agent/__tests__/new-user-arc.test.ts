/**
 * Trial and onboarding-arc branches after the deferred profile load
 * (prod call 2026-10-12). Session init decides "returning" before the profile
 * lands, so the flag is false for everyone on the fast path. A returning user
 * must not get startTrial or a fresh onboarding arc. The trial and onboarding
 * services (Firestore writers) are faked; the deferred-load tracking is real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackDeferredProfileLoad } from '../../../services/session/deferred-profile.js';
import { createUserProfile, type UserProfile } from '../../../types/user-profile.js';

const trial = vi.hoisted(() => ({
  isEligibleForTrial: vi.fn(async () => true),
  startTrial: vi.fn(async () => ({})),
  checkTrialStatus: vi.fn(async () => ({
    inTrial: false,
    timeRemainingMs: null,
    approachingEnd: false,
    trialEnded: false,
    showTransition: false,
    transitionPrompt: null,
  })),
}));
const arc = vi.hoisted(() => ({
  initializeOnboarding: vi.fn(async () => ({})),
  isInOnboardingPeriod: vi.fn(async () => false),
}));
vi.mock('../../../services/first-taste-trial.js', () => trial);
vi.mock('../../../services/outreach/intelligent-onboarding-arc.js', () => arc);

const { runTrialCheck, runOnboardingArc } = await import('../new-user-arc.js');
const { unsavedStandIn } = await import('../../../memory/storage/profile-read-failure.js');

/** Services as createSessionServices returns them on the fast path, plus the late load. */
function fastPath(profile: UserProfile | null) {
  const services: { userProfile: UserProfile | null } = { userProfile: null };
  let land: () => void = () => {};
  trackDeferredProfileLoad(
    services,
    new Promise<void>((resolve) => {
      land = () => {
        services.userProfile = profile;
        resolve();
      };
    })
  );
  const initFlag = (services.userProfile?.totalConversations ?? 0) > 0;
  return { services, initFlag, land };
}

const freshTrialState = () => ({
  isTrialUser: false,
  isFirstConversation: false,
  trialStatus: null,
});

function returningProfile(): UserProfile {
  const p = createUserProfile('user-seth', 'seth');
  p.totalConversations = 654;
  return p;
}

describe('trial and onboarding wait for the deferred profile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returning user (654 conversations): no trial started, no new onboarding arc', async () => {
    const { services, initFlag, land } = fastPath(returningProfile());
    expect(initFlag).toBe(false);

    const trialDone = runTrialCheck('user-seth', services, initFlag, freshTrialState());
    const arcDone = runOnboardingArc('user-seth', 'seth', services, initFlag);
    land();
    const state = await trialDone;
    await arcDone;

    expect(trial.isEligibleForTrial).not.toHaveBeenCalled();
    expect(trial.startTrial).not.toHaveBeenCalled();
    expect(trial.checkTrialStatus).toHaveBeenCalledWith('user-seth', 0);
    expect(state.isFirstConversation).toBe(false);
    expect(arc.initializeOnboarding).not.toHaveBeenCalled();
    expect(arc.isInOnboardingPeriod).toHaveBeenCalledWith('user-seth');
  });

  it('genuinely new user (0 conversations): trial starts and onboarding initializes', async () => {
    const { services, initFlag, land } = fastPath(createUserProfile('user-new', 'sam'));

    const trialDone = runTrialCheck('user-new', services, initFlag, freshTrialState());
    const arcDone = runOnboardingArc('user-new', undefined, services, initFlag);
    land();
    const state = await trialDone;
    await arcDone;

    expect(trial.startTrial).toHaveBeenCalledWith('user-new');
    expect(state.isTrialUser).toBe(true);
    expect(state.isFirstConversation).toBe(true);
    expect(arc.initializeOnboarding).toHaveBeenCalledWith('user-new', { name: 'sam' });
  });

  it('a stand-in after a failed profile read: no trial, no welcome, no fresh arc', async () => {
    const standIn = await unsavedStandIn('user-seth', 'seth', new Error('14 UNAVAILABLE'));
    const { services, initFlag, land } = fastPath(standIn);

    const trialDone = runTrialCheck('user-seth', services, initFlag, freshTrialState());
    const arcDone = runOnboardingArc('user-seth', 'seth', services, initFlag);
    land();
    const state = await trialDone;
    await arcDone;

    expect(trial.isEligibleForTrial).not.toHaveBeenCalled();
    expect(trial.startTrial).not.toHaveBeenCalled();
    expect(state).toEqual(freshTrialState()); // isTrialUser false: no trial welcome prompt
    expect(arc.initializeOnboarding).not.toHaveBeenCalled();
  });

  it('does not decide before the profile lands', async () => {
    const { services, initFlag, land } = fastPath(returningProfile());
    const arcDone = runOnboardingArc('user-seth', 'seth', services, initFlag);
    await new Promise((r) => {
      setTimeout(r, 10);
    });
    expect(arc.initializeOnboarding).not.toHaveBeenCalled();
    expect(arc.isInOnboardingPeriod).not.toHaveBeenCalled();
    land();
    await arcDone;
    expect(arc.isInOnboardingPeriod).toHaveBeenCalled();
  });
});
