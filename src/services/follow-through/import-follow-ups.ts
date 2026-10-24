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
 * A bookend already made keeps up with its date: a time said differently on a
 * later call moves its eventAt, a time withdrawn clears it, and a date closed
 * or gone releases it. Its follow-up is never left on the old time.
 *
 * @module services/follow-through/import-follow-ups
 */

import { createLogger } from '../../utils/safe-logger.js';
import { apply, type FollowUp } from './follow-up.js';
import type { FollowUpSources, FollowUpStore, SourceItem } from './ports.js';

const log = createLogger({ module: 'follow-through-import' });

export interface ImportResult {
  readonly seen: number;
  readonly opened: number;
  readonly failed: number;
}

/** Brings a live bookend up to date with its date; false when the store refused it. */
async function sync(
  store: FollowUpStore,
  f: FollowUp,
  item: SourceItem,
  now: Date
): Promise<boolean> {
  if (item.gone) {
    const next = apply(f, { type: 'release', reason: 'stale' }, now);
    return next.success && store.save(next.data, f.updatedAt);
  }
  const eventAt = item.eventAt ?? null;
  if ((f.eventAt ?? null) === eventAt) return true;
  const eventPrecision = eventAt ? 'time' : 'none';
  return store.save({ ...f, eventAt, eventPrecision, updatedAt: now.toISOString() }, f.updatedAt);
}

/** The live bookends, by the fact each was made from; null when they can't be read. */
async function liveBookends(
  store: FollowUpStore,
  userId: string
): Promise<Map<string, FollowUp> | null> {
  try {
    const live = await store.live(userId);
    return new Map(live.filter((f) => f.source.store === 'world_facts').map((f) => [f.source.ref, f])); // prettier-ignore
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Live bookends unreadable: importing without them');
    return null;
  }
}

export async function importFollowUps(
  userId: string,
  callerZone: string,
  sources: FollowUpSources,
  store: FollowUpStore,
  now: Date,
  opts: { bookends?: boolean } = {}
): Promise<ImportResult> {
  // BOOKENDS off: the sources are asked exactly as before. Without the live ones,
  // no bookend comes in at all, so none is left on an old time.
  const made = opts.bookends ? await liveBookends(store, userId) : null;
  const items = await (made
    ? sources.itemsFor(userId, now, { bookends: { zone: callerZone, made: [...made.keys()] } })
    : sources.itemsFor(userId, now));
  const results = await Promise.allSettled(
    items.map(async (item) => {
      const live = item.source.store === 'world_facts' ? made?.get(item.source.ref) : undefined;
      if (live) {
        if (!(await sync(store, live, item, now))) throw new Error('bookend changed meanwhile');
        return null;
      }
      return store.open({ ...item, userId, zone: item.zone ?? callerZone }, now);
    })
  );
  let opened = 0;
  let failed = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      if (r.value?.createdAt === now.toISOString()) opened++;
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
