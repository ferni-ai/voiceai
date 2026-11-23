/**
 * A user doc that holds side data but no profile reads as the caller's profile (#4293).
 *
 * learnTemporalPattern merged `temporalPatterns` into bogle_users/{id} for a caller whose
 * profile was never stored under that id (prod: `device:` ids), leaving a doc with no `id`.
 * Every read then failed the stored-profile check (InvalidStoredProfileError), getProfile
 * answered null, and the caller was treated as new on every call.
 *
 * With DEVICE_PROFILE_PARTIAL_REPAIR on, such a doc is repaired on read with repairStoredDoc,
 * the same repair getProfileForWrite already applies: defaults underneath, stored fields on top.
 * Only a doc whose one fault is the missing `id` is repaired. An `id` of the wrong type, a field
 * of the wrong type, or the erasure mark is still an invalid profile and throws, as before.
 *
 * @module memory/storage/partial-profile-repair
 */

import { flagOn } from '../../config/env-flag.js';
import type { UserProfile } from '../../types/user-profile.js';
import { isErasedOrErasing } from '../../utils/erasing-mark.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isValidUserProfile } from '../type-guards.js';
import { invalidStoredProfile, repairStoredDoc } from './profile-read-failure.js';

const log = createLogger({ module: 'partial-profile-repair' });

/** True when the doc lacks only its `id`: with one added, every checked field is valid. */
function isRepairablePartialDoc(userId: string, doc: Record<string, unknown>): boolean {
  if (doc.id != null) return false; // an id of the wrong type is corrupt, not partial
  if (isErasedOrErasing({ exists: true, data: () => doc })) return false;
  return isValidUserProfile({ ...doc, id: userId });
}

/**
 * The stored doc as a profile: returned as is when valid, repaired when it lacks only its `id`
 * (flag on), otherwise InvalidStoredProfileError is thrown, as with the flag off.
 */
export async function storedProfileOrThrow(
  userId: string,
  doc: Record<string, unknown>
): Promise<UserProfile> {
  if (isValidUserProfile(doc)) return doc;
  if (flagOn('DEVICE_PROFILE_PARTIAL_REPAIR') && isRepairablePartialDoc(userId, doc)) {
    log.info({ userId, dataKeys: Object.keys(doc) }, 'Partial stored profile repaired on read');
    return repairStoredDoc(userId, doc);
  }
  throw invalidStoredProfile(userId, doc);
}
