/**
 * A failed profile read must never turn into a saved default profile.
 *
 * getOrCreateProfile and session start used to treat any failed read as "new user": they built
 * createUserProfile's defaults and saved them with merge, so a transient Firestore error reset
 * familyMembers, totalConversations and relationshipStage for a returning member.
 *
 * Three outcomes, kept apart:
 * - no stored profile: the caller creates one, as before;
 * - a stored doc that isn't a valid profile (no `id`, e.g. first written by an SMS or consent
 *   writer): repaired, with defaults filled in under the stored fields, so it still gets created;
 * - the read itself failed: an in-memory stand-in for this call, marked so that every MemoryStore
 *   backend refuses to save it (refuseUnsaved).
 *
 * The mark is an enumerable symbol key, so `{ ...profile, x }` keeps it and the profile cannot be
 * laundered by a spread. JSON and structuredClone drop it, so a stand-in must never be cached.
 *
 * @module memory/storage/profile-read-failure
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { UserProfile } from '../../types/user-profile.js';

const UNSAVED = Symbol.for('ferni.profileReadFailed');

/** Thrown by saveProfile for a stand-in built after a failed read. */
export class UnsavedProfileError extends Error {
  override readonly name = 'UnsavedProfileError';
  constructor(readonly userId: string) {
    super(`profile for ${userId} could not be read, so a stand-in is not saved over it`);
  }
}

/** A stored doc exists but isn't a valid profile; `stored` is what was read. */
export class InvalidStoredProfileError extends Error {
  override readonly name = 'InvalidStoredProfileError';
  constructor(
    readonly userId: string,
    readonly stored: Record<string, unknown>
  ) {
    super(`stored profile for ${userId} is not a valid profile`);
  }
}

/** Log what is wrong with a stored profile doc and build the error to throw. */
export function invalidStoredProfile(userId: string, stored: unknown): InvalidStoredProfileError {
  const data = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const { id, name, createdAt } = data;
  const sample = { userId, hasId: !!id, hasName: !!name, hasCreatedAt: !!createdAt };
  getLogger().error({ ...sample, dataKeys: Object.keys(data) }, 'Invalid user profile data');
  return new InvalidStoredProfileError(userId, data);
}

export function isUnsavedProfile(profile: unknown): boolean {
  return Boolean(profile && (profile as Record<symbol, unknown>)[UNSAVED]);
}

/** Every MemoryStore.saveProfile calls this first. */
export function refuseUnsaved(profile: UserProfile): void {
  if (isUnsavedProfile(profile)) throw new UnsavedProfileError(profile.id);
}

/** Defaults for this call only, after a failed read: saving it throws UnsavedProfileError. */
export async function unsavedStandIn(
  userId: string,
  name: string | undefined,
  error: unknown
): Promise<UserProfile> {
  getLogger().warn(
    { userId, error: String(error) },
    'Profile read failed; using an unsaved default for now, never saving it'
  );
  const { createUserProfile } = await import('../../types/user-profile.js');
  return Object.assign(createUserProfile(userId, name), { [UNSAVED]: true });
}

/** A stored doc missing required fields: defaults underneath, everything stored kept on top. */
export async function repairedProfile(error: InvalidStoredProfileError): Promise<UserProfile> {
  const { createUserProfile } = await import('../../types/user-profile.js');
  return { ...createUserProfile(error.userId), ...error.stored, id: error.userId } as UserProfile;
}
