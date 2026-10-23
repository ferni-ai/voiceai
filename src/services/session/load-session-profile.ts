/**
 * The profile a call starts with: cache first (Redis, then the store), created on first contact.
 *
 * A failed read is not first contact. It used to come back as null, so session start saved a
 * fresh default profile over the member's real one (merge: familyMembers [], totalConversations
 * 0, relationshipStage 'new_acquaintance') and treated them as a stranger. Now the call gets an
 * unsaved stand-in: never cached, and the store refuses to save it (profile-read-failure.ts).
 *
 * @module services/session/load-session-profile
 */

import type { MemoryStore } from '../../memory/storage/store.js';
import {
  isProfileReadFailure,
  isUnsavedProfile,
  unsavedStandIn,
} from '../../memory/storage/profile-read-failure.js';
import type { UserProfile } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';

export async function loadSessionProfile(
  store: Pick<MemoryStore, 'getProfileForWrite' | 'saveProfile'>,
  userId: string,
  userName: string | undefined
): Promise<UserProfile> {
  // ⚡ Redis-backed cache: hit ~5-20ms vs Firestore ~100-500ms
  const { getProfileWithCache, cacheProfile, invalidateProfile } =
    await import('../data-layer/profile-cache.js');

  let profile: UserProfile | null;
  try {
    profile = await getProfileWithCache(userId, (uid) => store.getProfileForWrite(uid));
  } catch (error) {
    if (!isProfileReadFailure(error)) throw error; // a bug (e.g. a missing method), not a failed read
    return unsavedStandIn(userId, userName, error);
  }

  // Never fatal: a refused write (synthetic-write-guard) must not end the call
  const warnUnsaved = (e: unknown) => getLogger().warn({ error: String(e) }, 'Profile not saved');
  if (!profile) {
    const { createUserProfile } = await import('../../types/user-profile.js');
    // CRITICAL: Pass userName from onboarding so Ferni remembers their name!
    profile = createUserProfile(userId, userName);
    await store.saveProfile(profile).catch(warnUnsaved);
    void cacheProfile(userId, profile);
    getLogger().info(
      { userId, name: userName || '(none)' },
      '🆕 Created new user profile with name from onboarding'
    );
  } else if (!profile.name && userName) {
    // Existing profile without a name, but we now have one - update it!
    profile.name = userName;
    await store.saveProfile(profile).catch(warnUnsaved);
    void invalidateProfile(userId);
    getLogger().info(
      { userId, name: userName },
      '✨ Updated existing profile with name from onboarding'
    );
  }
  return profile;
}

/** The profile, unless it is a stand-in after a failed read: that one is never saved. */
export function savable<P>(profile: P | null | undefined): P | undefined {
  return profile && !isUnsavedProfile(profile) ? profile : undefined;
}
