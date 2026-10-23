/**
 * Bring what the existing stores hold into follow-ups: pending reminders,
 * open commitments and threads from the last call, one follow-up each, and
 * with BOOKENDS on, timed one-time dates (bookend-source.ts).
 *
 * Runs after a call. A follow-up's id comes from its source, so running it
 * again finds the ones it made instead of making more, and a source item
 * already closed as a follow-up (done, released) isn't reopened. One bad
 * item is logged and skipped; it never stops the rest.
 *
 * @module services/follow-through/import-follow-ups
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { FollowUpSources, FollowUpStore } from './ports.js';

const log = createLogger({ module: 'follow-through-import' });

export interface ImportResult {
  readonly seen: number;
  readonly opened: number;
  readonly failed: number;
}

export async function importFollowUps(
  userId: string,
  callerZone: string,
  sources: FollowUpSources,
  store: FollowUpStore,
  now: Date,
  opts: { bookends?: boolean } = {}
): Promise<ImportResult> {
  // BOOKENDS off: the sources are asked exactly as before.
  const items = await (opts.bookends
    ? sources.itemsFor(userId, now, { bookends: { zone: callerZone } })
    : sources.itemsFor(userId, now));
  const results = await Promise.allSettled(
    items.map(async (item) => store.open({ ...item, userId, zone: item.zone ?? callerZone }, now))
  );
  let opened = 0;
  let failed = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      if (r.value.createdAt === now.toISOString()) opened++;
      return;
    }
    failed++;
    log.warn(
      { error: String(r.reason), userId, source: items[i].source.store },
      'Follow-up not imported'
    );
  });
  log.info({ userId, seen: items.length, opened, failed }, 'Follow-ups imported');
  return { seen: items.length, opened, failed };
}
