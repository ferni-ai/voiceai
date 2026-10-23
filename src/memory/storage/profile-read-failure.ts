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
import { withoutProfileTokenFields } from '../../utils/token-at-rest.js';
import type { UserProfile } from '../../types/user-profile.js';
import { isValidUserProfile } from '../type-guards.js';

const UNSAVED = Symbol.for('ferni.profileReadFailed');

/** Thrown by saveProfile for a stand-in built after a failed read. */
export class UnsavedProfileError extends Error {
  override readonly name = 'UnsavedProfileError';
  constructor(readonly userId: string) {
    super(`profile for ${userId} could not be read, so a stand-in is not saved over it`);
  }
}

/**
 * A stored doc exists but isn't a valid profile. The error names the bad fields and never
 * carries the doc: loggers and Sentry serialise errors, and a profile holds private data.
 */
export class InvalidStoredProfileError extends Error {
  override readonly name = 'InvalidStoredProfileError';
  constructor(
    readonly userId: string,
    readonly invalidFields: string[]
  ) {
    super(`stored profile for ${userId} is not a valid profile (${invalidFields.join(', ')})`);
  }
}

/** What was read, for repairedProfile only; held off the error so it can't be serialised. */
const storedDocs = new WeakMap<InvalidStoredProfileError, Record<string, unknown>>();
const CHECKED_FIELDS = [
  'name',
  'email',
  'phone',
  'firstContact',
  'lastContact',
  'createdAt',
  'updatedAt',
];

/** Log which fields are wrong (names, never values) and build the error to throw. */
export function invalidStoredProfile(userId: string, stored: unknown): InvalidStoredProfileError {
  const data = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const invalidFields = [
    ...(typeof data.id === 'string' ? [] : ['id']),
    ...CHECKED_FIELDS.filter((f) => f in data && !isValidUserProfile({ id: userId, [f]: data[f] })),
  ];
  const fields = { userId, invalidFields, dataKeys: Object.keys(data) };
  getLogger().error(fields, 'Invalid user profile data');
  const error = new InvalidStoredProfileError(userId, invalidFields);
  storedDocs.set(error, data);
  return error;
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

/**
 * A stored doc missing required fields: defaults underneath, everything stored kept on top.
 * Token fields are left out (saveProfile never writes them, so the stored ones stay).
 */
export async function repairedProfile(error: InvalidStoredProfileError): Promise<UserProfile> {
  const stored = withoutProfileTokenFields(storedDocs.get(error) ?? {});
  const { createUserProfile } = await import('../../types/user-profile.js');
  return { ...createUserProfile(error.userId), ...stored, id: error.userId } as UserProfile;
}
