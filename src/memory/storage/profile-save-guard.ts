/**
 * What no MemoryStore backend ever saves. Every backend's saveProfile asks notStored first.
 *
 * - A stand-in built after a failed read throws (refuseUnsaved, profile-read-failure.ts).
 * - The person on a call placed for a member (`onbehalf:<callId>`) is never stored, with
 *   ONBEHALF_WRITE_GATE on or off: they never signed up. The trial start and the contact info
 *   they spoke both reached saveProfile and created bogle_users/onbehalf:<callId>.
 *
 * @module memory/storage/profile-save-guard
 */
import type { UserProfile } from '../../types/user-profile.js';
import { isThirdPartyCallUser } from '../third-party-call.js';
import { refuseUnsaved } from './profile-read-failure.js';

/** True when the profile must not be stored; throws for a stand-in. */
export function notStored(profile: UserProfile): boolean {
  refuseUnsaved(profile);
  return isThirdPartyCallUser(profile.id);
}
