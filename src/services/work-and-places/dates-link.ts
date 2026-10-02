/**
 * Upcoming trips and work events (interviews, reviews, presentations,
 * deadlines) are reminded through the important-dates store, so the user
 * gets the same reminders and the persona brings them up at session start.
 * F's topic prediction also reads upcoming dates, so a trip next week becomes
 * a likely topic without a parallel mechanism.
 *
 * Only items pinned to a specific day are synced; "in March" stays here.
 *
 * @module services/work-and-places/dates-link
 */

import {
  deleteImportantDate,
  importantDateIdFor,
  upsertImportantDate,
  type ImportantDateInput,
  type ImportantDateKind,
} from '../important-dates/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { normalizeSubject } from './rules.js';
import type { LifeItem, TombstoneReason } from './types.js';

const log = createLogger({ module: 'WorkAndPlacesDates' });

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The important date an item should have, or null when it has no specific upcoming day. */
export function importantDateFor(item: LifeItem): ImportantDateInput | null {
  if (item.status !== 'planned' || !item.startDate || !DAY_RE.test(item.startDate)) return null;
  let kind: ImportantDateKind;
  let title: string;
  let subtype: string;
  if (item.kind === 'trip') {
    kind = 'event';
    title = item.title.startsWith('Trip to') ? item.title : `Trip to ${item.place ?? item.title}`;
    subtype = 'trip';
  } else if (item.kind === 'event' || item.kind === 'application') {
    kind = item.eventType === 'deadline' ? 'deadline' : 'event';
    title = item.title;
    subtype = 'career';
  } else {
    return null;
  }
  return {
    key: `${kind}:${subtype}:${normalizeSubject(item.place ?? item.title)}:${item.startDate}`,
    title,
    date: item.startDate,
    recurring: false,
    kind,
    source: item.userEdited || item.source === 'user' ? 'user' : 'detected',
    sourceConversationIds: [...item.sourceConversationIds],
    confidence: item.confidence,
    subtype,
  };
}

/**
 * Create or update the item's important date. Returns the date id to store on
 * the item (undefined when there is none). Never throws.
 */
export async function syncItemDate(userId: string, item: LifeItem): Promise<string | undefined> {
  const input = importantDateFor(item);
  if (!input) return item.dateId;
  const id = importantDateIdFor(input.key);
  try {
    if (item.dateId && item.dateId !== id) {
      // The day changed: the old reminder must not fire.
      await deleteImportantDate(userId, item.dateId, 'user_deleted');
    }
    const result = await upsertImportantDate(userId, input);
    if (!result.success) {
      log.debug({ userId, error: result.error.message }, 'Trip/event date not synced');
      return item.dateId;
    }
    return result.data.status === 'skipped_tombstoned' ? undefined : id;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Trip/event date sync failed');
    return item.dateId;
  }
}

/** Remove the reminder that belongs to a deleted item. Never throws. */
export async function removeItemDate(
  userId: string,
  item: LifeItem,
  reason: TombstoneReason
): Promise<void> {
  if (!item.dateId) return;
  try {
    await deleteImportantDate(
      userId,
      item.dateId,
      reason === 'voice_forget' ? reason : 'user_deleted'
    );
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not remove trip/event date');
  }
}
