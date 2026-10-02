/**
 * Links from the life story to the rest of memory, so nothing is duplicated:
 *
 * - people in a story → personal insights' people model (`personId`)
 * - the place someone grew up → work & places (`placeId`; that service keeps
 *   the place itself, as a past home)
 * - a story pinned to a specific day → an important date (recurring), so the
 *   anniversary is remembered like any other date. Deleting the story deletes
 *   the date.
 *
 * Every function here is best effort and never throws.
 *
 * @module services/life-story/links
 */

import { createLogger } from '../../utils/safe-logger.js';
import { normalizeSubject } from './rules.js';
import { saveItem } from './store.js';
import type { LinkedPerson, StoryItem, TombstoneReason } from './types.js';

const log = createLogger({ module: 'LifeStoryLinks' });

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

async function linkPeople(
  userId: string,
  people: readonly LinkedPerson[]
): Promise<LinkedPerson[]> {
  if (!people.some((p) => !p.personId)) return [...people];
  try {
    const { getPeople, findPerson } = await import('../personal-insights/index.js');
    const known = await getPeople(userId);
    return people.map((p) => {
      if (p.personId) return p;
      const match = findPerson(known, p.name);
      return match ? { name: p.name, personId: match.id } : p;
    });
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'People link skipped');
    return [...people];
  }
}

async function linkPlace(userId: string, name: string): Promise<string | undefined> {
  try {
    const { listLifeItems } = await import('../work-and-places/index.js');
    const target = normalizeSubject(name);
    const match = (await listLifeItems(userId, 'places')).find(
      (i) =>
        normalizeSubject(i.place ?? i.title) === target ||
        normalizeSubject(i.title).endsWith(target)
    );
    return match?.id;
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'Place link skipped');
    return undefined;
  }
}

async function syncDate(userId: string, item: StoryItem): Promise<string | undefined> {
  if (!item.date || !DAY_RE.test(item.date)) return item.dateId;
  try {
    const { importantDateIdFor, upsertImportantDate } = await import('../important-dates/index.js');
    const key = `other:life_story:${item.id}`;
    const result = await upsertImportantDate(userId, {
      key,
      title: item.title,
      date: item.date,
      recurring: true,
      kind: 'other',
      subtype: 'life_story',
      source: item.userEdited || item.source === 'user' ? 'user' : 'detected',
      sourceConversationIds: [...item.sourceConversationIds],
      confidence: item.confidence,
      ...(item.people?.[0]?.personId ? { personId: item.people[0].personId } : {}),
    });
    if (!result.success || result.data.status === 'skipped_tombstoned') return item.dateId;
    return importantDateIdFor(key);
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'Story date not synced');
    return item.dateId;
  }
}

/** Fill in links for a stored story item and save it when anything changed. */
export async function linkStoryItem(userId: string, item: StoryItem): Promise<StoryItem> {
  const people = item.people ? await linkPeople(userId, item.people) : undefined;
  const placeId =
    item.place && !item.place.placeId
      ? await linkPlace(userId, item.place.name)
      : item.place?.placeId;
  const dateId = await syncDate(userId, item);
  const next: StoryItem = {
    ...item,
    ...(people ? { people } : {}),
    ...(item.place ? { place: { name: item.place.name, ...(placeId ? { placeId } : {}) } } : {}),
    ...(dateId ? { dateId } : {}),
  };
  if (JSON.stringify(next) !== JSON.stringify(item)) {
    try {
      await saveItem(userId, next);
    } catch (error) {
      log.debug({ userId, error: String(error) }, 'Could not save story links');
    }
  }
  return next;
}

/** Remove the important date that belongs to a deleted story. */
export async function removeStoryDate(
  userId: string,
  item: StoryItem,
  reason: TombstoneReason
): Promise<void> {
  if (!item.dateId) return;
  try {
    const { deleteImportantDate } = await import('../important-dates/index.js');
    await deleteImportantDate(
      userId,
      item.dateId,
      reason === 'voice_forget' ? reason : 'user_deleted'
    );
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not remove story date');
  }
}
