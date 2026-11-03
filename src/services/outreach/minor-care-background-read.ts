/**
 * MINOR_CARE: the background jobs' hold reader (utils/minor-care-background-hold.ts), registered
 * when this module loads. A job route imports it before its job runs.
 *
 * A user is held from background jobs while either is true, both read from one read of the hold doc
 * (minor_care_holds/{userId}) whatever this process's flags, since the voice agent that wrote it
 * may run them differently:
 * - heldUntil is still ahead (the shared hold, written while a held call runs and for 6 h after);
 * - a held call's window is still stored (kept KEEP_DAYS after its purge). The purge doesn't scrub
 *   every store these jobs read, so what the call stored before its hold began can still be there.
 *
 * Rejects when the doc can't be read in time; the port treats that as held.
 *
 * @module services/outreach/minor-care-background-read
 */
import { setBackgroundHoldReader } from '../../utils/minor-care-background-hold.js';
import { heldSince, noteStoredHeldWindows } from '../trust-systems/index.js';
import { readHoldDocStrict } from './minor-care-shared-hold.js';

export async function heldFromBackgroundJobs(userId: string): Promise<boolean> {
  const doc = await readHoldDocStrict(userId);
  const until = doc?.heldUntil;
  if (typeof until === 'number' && until > Date.now()) return true;
  noteStoredHeldWindows(userId, doc);
  return heldSince(userId) !== undefined;
}

setBackgroundHoldReader(heldFromBackgroundJobs);
