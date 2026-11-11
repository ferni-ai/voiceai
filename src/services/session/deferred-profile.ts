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
/** Loads that have settled, so a later persona's setup (a handoff) can skip the wait. */
const settledLoads = new WeakSet<object>();

/** Record the in-flight deferred load for these session services. */
export function trackDeferredProfileLoad(services: object, load: Promise<unknown>): void {
  pendingLoads.set(
    services,
    load
      .catch(() => undefined)
      .then(() => {
        settledLoads.add(services);
      })
  );
}

/**
 * Wait for the deferred load to settle, for at most capMs. True when it settled (or none is
 * pending, or it settled earlier: at once); false when the cap passed first. Never rejects:
 * a failed load settles too, and the caller then reads whatever the services hold.
 */
export async function deferredProfileSettled(services: object, capMs: number): Promise<boolean> {
  const pending = pendingLoads.get(services);
  if (!pending || settledLoads.has(services)) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), capMs);
  });
  try {
    return await Promise.race([pending.then(() => true as const), late]);
  } finally {
    clearTimeout(timer);
  }
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

/** The profile once any deferred load has settled (at once when none is pending). */
export async function profileOnceLoaded<P>(services: { userProfile?: P }): Promise<P | undefined> {
  await pendingLoads.get(services);
  return services.userProfile;
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
