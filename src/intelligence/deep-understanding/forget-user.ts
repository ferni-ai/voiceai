/**
 * MINOR_CARE: forget one user's deep understanding. The ten profiles are kept in memory per user
 * and fed by the deep_understanding context builder on every turn (the caller's quotes, the
 * people they name, avoided topics, desires, chapter signals). A held call's end skips the save,
 * but the profiles stay, and a later unheld call's end would save them (session start replaces
 * only the profiles it finds stored). purgeHeldUser calls this at the end of a held call.
 *
 * @module intelligence/deep-understanding/forget-user
 */
import { forgetEnergyUser } from './energy.js';
import { forgetFlowUser } from './flow.js';
import { forgetHopeUser } from './hope.js';
import { forgetChapterUser } from './life-chapter.js';
import { forgetLifeRhythmUser } from './life-rhythm.js';
import { holdUntilReloaded } from './persistence.js';
import { forgetRelationalUser } from './relationships.js';
import { forgetRepairUser } from './repair.js';
import { forgetResistanceUser } from './resistance.js';
import { forgetSilenceUser } from './silence.js';
import { forgetSubconsciousUser } from './subconscious.js';

/** Drop this user's profile in every system (no one else's); no save until they're read back. */
export function clearDeepUnderstandingUser(userId: string): void {
  for (const forget of [
    forgetSilenceUser,
    forgetLifeRhythmUser,
    forgetRelationalUser,
    forgetResistanceUser,
    forgetEnergyUser,
    forgetSubconsciousUser,
    forgetFlowUser,
    forgetRepairUser,
    forgetHopeUser,
    forgetChapterUser,
  ])
    forget(userId);
  // A live session for the same user (an owner) would otherwise save empty profiles over theirs
  holdUntilReloaded(userId);
}
