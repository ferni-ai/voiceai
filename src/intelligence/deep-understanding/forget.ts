/**
 * MINOR_CARE purge for deep understanding: at the end of a held call (a caller under 18 by their
 * own words, not a verified owner), each of the ten systems forgets the user, so nothing the call
 * taught them is written later. The user then counts as not loaded, so a live session for the
 * same user (an owner) reloads from storage before it writes; a held user's write is refused by
 * userHeld at write time (persistence.ts).
 *
 * @module intelligence/deep-understanding/forget
 */
import { forgetSilenceUser } from './silence.js';
import { forgetRelationshipsUser } from './relationships.js';
import { forgetLifeRhythmUser } from './life-rhythm.js';
import { forgetResistanceUser } from './resistance.js';
import { forgetEnergyUser } from './energy.js';
import { forgetSubconsciousUser } from './subconscious.js';
import { forgetFlowUser } from './flow.js';
import { forgetRepairUser } from './repair.js';
import { forgetHopeUser } from './hope.js';
import { forgetLifeChapterUser } from './life-chapter.js';
import { forgetDeepUnderstandingLoaded } from './persistence.js';

const FORGETS = [
  forgetSilenceUser,
  forgetRelationshipsUser,
  forgetLifeRhythmUser,
  forgetResistanceUser,
  forgetEnergyUser,
  forgetSubconsciousUser,
  forgetFlowUser,
  forgetRepairUser,
  forgetHopeUser,
  forgetLifeChapterUser,
];

export function purgeDeepUnderstandingUser(userId: string): void {
  for (const forget of FORGETS) forget(userId);
  forgetDeepUnderstandingLoaded(userId);
}
