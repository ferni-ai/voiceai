/**
 * MINOR_CARE: the background jobs' hold reader (utils/minor-care-background-hold.ts), registered
 * when this module loads. A job route imports it before its job runs.
 *
 * A user is held from background jobs while either is true:
 * - the shared hold record says so (sharedHeldStrict: unreadable or late means held). It is only
 *   written with MINOR_CARE_SHARED_HOLD on, so it can't be the only check;
 * - a held call's window is still stored (minor_care_holds/{userId}.windows, kept KEEP_DAYS after
 *   its purge, read whatever this process's MINOR_CARE). The purge doesn't scrub every store
 *   these jobs read, so what the call stored before its hold began can still be there.
 *
 * Rejects when the windows can't be read; the port treats that as held.
 *
 * @module services/outreach/minor-care-background-read
 */
import { setBackgroundHoldReader } from '../../utils/minor-care-background-hold.js';
import { heldSince, loadStoredHeldWindows } from '../trust-systems/index.js';
import { sharedHeldStrict } from './minor-care-shared-hold.js';

export async function heldFromBackgroundJobs(userId: string): Promise<boolean> {
  if (await sharedHeldStrict(userId)) return true;
  await loadStoredHeldWindows(userId);
  return heldSince(userId) !== undefined;
}

setBackgroundHoldReader(heldFromBackgroundJobs);
