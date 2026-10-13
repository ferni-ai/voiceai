/**
 * The deferred profile load and the "returning user" decisions that depend on it.
 *
 * On the multi-agent fast path createSessionServices skips the profile load and
 * attaches the profile later (deferProfileLoad). Anything that decides "returning
 * user" during session init sees a null profile and says false for everyone: a
 * user with 654 conversations was told "This is your first conversation with
 * them" (prod call 2026-10-12), and the same false sent returning users down the
 * new-user trial and onboarding-arc paths. These helpers let those decisions wait
 * for the load and use the loaded profile.
 */

import type { UserProfile } from '../../types/user-profile.js';

interface ProfileHolder {
  userProfile: UserProfile | null;
}

const pendingLoads = new WeakMap<object, Promise<unknown>>();

/** Record the in-flight deferred load for these session services. */
export function trackDeferredProfileLoad(services: object, load: Promise<unknown>): void {
  pendingLoads.set(
    services,
    load.catch(() => undefined)
  );
}

/** Same rule session-manager uses once the profile is loaded. */
export function isReturningProfile(profile: UserProfile | null | undefined): boolean {
  return (profile?.totalConversations ?? 0) > 0;
}

/**
 * Whether this is a returning user, after any deferred profile load has settled.
 * Resolves at once when no load is pending (the profile was loaded up front).
 */
export async function returningOnceLoaded(
  services: ProfileHolder,
  initFlag: boolean
): Promise<boolean> {
  if (initFlag) return true;
  await pendingLoads.get(services);
  return isReturningProfile(services.userProfile);
}

/**
 * When the deferred profile lands and shows a returning user, set
 * userData.isReturningUser, which the per-turn context builders read.
 */
export function syncReturningOnceLoaded(
  services: ProfileHolder,
  initFlag: boolean,
  userData: { isReturningUser?: unknown }
): void {
  void returningOnceLoaded(services, initFlag).then((returning) => {
    if (returning && userData.isReturningUser !== true) userData.isReturningUser = true;
  });
}
