/**
 * MINOR_CARE: retry the held-window scrubs that never completed, without waiting for a call.
 *
 * A purge whose scrub failed (held-window.ts) was retried only at that user's next session start.
 * A caller who never calls again kept their words in storage, hidden only by the stored window.
 * This sweep finds the windows still unscrubbed an hour after their purge (unscrubbedSince) and
 * runs the same scrubs a session start runs (scrubHeldStores, with every addHeldScrub the purge
 * module registers), marking a window scrubbed only when all of them succeed. One that fails
 * again stays unscrubbed, with no TTL, for the next run.
 *
 * Idempotent (a scrub of a clean doc writes nothing, and the marking is a transaction), bounded
 * (PAGE docs a read, MAX a run) and safe during a live call: the same transactions a session start
 * uses. Logs ids and counts only. `scanAll` reads every hold doc by id (from `after`), for docs
 * written before unscrubbedSince existed.
 *
 * @module services/trust-systems/held-scrub-sweep
 */
import { createLogger } from '../../utils/safe-logger.js';
import {
  HOLDS,
  keepUnscrubbedWindows,
  loadStoredHeldWindows,
  unscrubbedEnds,
} from './held-window.js';
import { scrubAndMark } from './reload-before-save.js';
import { getTrustDb } from './trust-doc.js';

const log = createLogger({ module: 'minor-care-held-scrub-sweep' });

/** A window this young may still be in its purge's own scrub. */
export const SWEEP_MIN_AGE_MS = 60 * 60 * 1000;
export const PAGE = 50;
export const MAX = 200;

export interface SweepOptions {
  now?: number;
  page?: number;
  max?: number;
  scanAll?: boolean;
  after?: string;
}

export interface SweepReport {
  read: number;
  retried: number;
  scrubbed: number;
  failed: number;
  /** scanAll: the last id read, when more remain (pass it back as `after`). */
  next?: string;
}

type Doc = { id: string; data: () => Record<string, unknown> | undefined };

/** One user's retry: scrub, then mark; a failure leaves the window unscrubbed and kept. */
async function retry(userId: string): Promise<boolean> {
  try {
    if (!(await loadStoredHeldWindows(userId)).unscrubbed) return true; // a session start won
    if (await scrubAndMark(userId)) return true;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'MINOR_CARE held-scrub retry threw');
  }
  await keepUnscrubbedWindows(userId);
  return false;
}

export async function sweepHeldScrubs(opts: SweepOptions = {}): Promise<SweepReport> {
  const now = opts.now ?? Date.now();
  const page = Math.max(1, opts.page ?? PAGE);
  const max = Math.max(1, opts.max ?? MAX);
  const cutoff = now - SWEEP_MIN_AGE_MS;
  const holds = getTrustDb().collection(HOLDS);
  const report: SweepReport = { read: 0, retried: 0, scrubbed: 0, failed: 0 };
  let last: Doc | undefined;
  let after = opts.after;
  while (report.read < max) {
    const limit = Math.min(page, max - report.read);
    let q = opts.scanAll
      ? holds.orderBy('__name__')
      : holds.where('unscrubbedSince', '<=', cutoff).orderBy('unscrubbedSince');
    if (opts.scanAll && after) q = q.startAfter(after);
    else if (last) q = q.startAfter(last as never);
    const docs = (await q.limit(limit).get()).docs as Doc[];
    for (const doc of docs) {
      report.read++;
      if (!unscrubbedEnds(doc.data()).some((end) => end <= cutoff)) continue;
      report.retried++;
      if (await retry(doc.id)) report.scrubbed++;
      else report.failed++;
    }
    last = docs[docs.length - 1];
    after = last?.id;
    if (docs.length < limit) return done(report);
  }
  if (opts.scanAll && last) report.next = last.id;
  return done(report);
}

function done(report: SweepReport): SweepReport {
  log.info({ ...report }, 'MINOR_CARE held-scrub sweep');
  return report;
}
