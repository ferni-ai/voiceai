/**
 * MINOR_CARE: the per-caller check for background jobs that read or rewrite stored memory.
 *
 * A caller the hold record holds, or whose hold can't be read, is skipped before any read and
 * counted as skipped; their id is not logged. The answer comes from backgroundHeld, which is
 * ungated by this process's flags and fails closed, so the job's route must load the hold reader
 * (services/outreach/minor-care-background-read) before the job runs, or every caller is skipped.
 *
 * @module tasks/scheduled/skip-if-held
 */
import { getLogger } from '../../utils/safe-logger.js';
import { backgroundHeld } from '../../utils/minor-care-background-hold.js';
import type { JobContext } from './base-job.js';

const log = getLogger();

export async function skipIfHeld(userId: string, counts: JobContext['counters']): Promise<boolean> {
  if (!(await backgroundHeld(userId))) return false;
  counts.skipped++;
  log.info({ reason: 'minor_care' }, 'Background job skipped a held caller');
  return true;
}
