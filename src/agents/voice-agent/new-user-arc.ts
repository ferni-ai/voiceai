/**
 * The new-user branches of session init: the first-taste trial and the
 * onboarding arc.
 *
 * Both used to branch on the "returning user" flag session init computes before
 * the deferred profile load lands (multi-agent fast path), which is false for
 * everyone. A returning user with no trialState got a trial started (a full
 * profile save), and one with no onboarding doc got a fresh 14-day arc with
 * signupDate = now. They now wait for the load and decide from the profile.
 */

import { isUnsavedProfile } from '../../memory/storage/profile-read-failure.js';
import { diag } from '../../services/diagnostic-logger.js';
import {
  checkTrialStatus,
  isEligibleForTrial,
  startTrial,
  type TrialCheckResult,
} from '../../services/first-taste-trial.js';
import {
  initializeOnboarding,
  isInOnboardingPeriod,
} from '../../services/outreach/intelligent-onboarding-arc.js';
import { returningOnceLoaded } from '../../services/session/deferred-profile.js';
import type { UserProfile } from '../../types/user-profile.js';
import { fireAndForget } from '../../utils/safe-fire-and-forget.js';

export interface SessionTrialState {
  isTrialUser: boolean;
  isFirstConversation: boolean;
  trialStatus: TrialCheckResult | null;
}

interface ProfileHolder {
  userProfile: UserProfile | null;
}

/** After a failed profile read the caller is unknown, not new: no trial, no fresh arc. */
function unread(userId: string, services: ProfileHolder): boolean {
  if (!isUnsavedProfile(services.userProfile)) return false;
  diag.session('Profile unread this call: no new-user trial or onboarding', { userId });
  return true;
}

/** Trial check in the background; fills trialState and resolves with it. */
export async function runTrialCheck(
  userId: string,
  services: ProfileHolder,
  initFlag: boolean,
  trialState: SessionTrialState
): Promise<SessionTrialState> {
  try {
    const returning = await returningOnceLoaded(services, initFlag);
    if (unread(userId, services)) return trialState;
    if (!returning) {
      // New user - check eligibility and start trial
      const eligible = await isEligibleForTrial(userId);
      if (eligible) {
        await startTrial(userId);
        trialState.isTrialUser = true;
        trialState.isFirstConversation = true;
        trialState.trialStatus = await checkTrialStatus(userId, 0);
        diag.session('Started first taste trial for new user', { userId });
      }
    } else {
      // Returning user - just check status
      const status = await checkTrialStatus(userId, 0);
      trialState.trialStatus = status;
      if (status.inTrial) {
        trialState.isTrialUser = true;
        diag.session('User is in active trial', {
          userId,
          timeRemainingMs: status.timeRemainingMs,
        });
      }
    }
  } catch (trialErr) {
    diag.warn('Trial check failed (non-fatal)', { error: String(trialErr) });
  }
  return trialState;
}

/** Onboarding arc: initialize for new users, note the period for returning ones. */
export async function runOnboardingArc(
  userId: string,
  userName: string | undefined,
  services: ProfileHolder,
  initFlag: boolean
): Promise<void> {
  try {
    const returning = await returningOnceLoaded(services, initFlag);
    if (unread(userId, services)) return;
    if (!returning) {
      await initializeOnboarding(userId, { name: userName || services.userProfile?.name });
      diag.session('Onboarding arc initialized for new user', { userId });
    } else {
      const inOnboarding = await isInOnboardingPeriod(userId);
      if (inOnboarding) {
        diag.session('User in onboarding period', { userId });
      }
    }
  } catch (err) {
    diag.warn('Onboarding initialization failed (non-fatal)', { error: String(err) });
  }
}

export function startOnboardingArc(
  userId: string,
  userName: string | undefined,
  services: ProfileHolder,
  initFlag: boolean
): void {
  fireAndForget(
    async () => runOnboardingArc(userId, userName, services, initFlag),
    'session-init:onboarding-init'
  );
}
