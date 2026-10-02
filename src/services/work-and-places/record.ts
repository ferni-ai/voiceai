/**
 * Service operations for work & places memory: store + important-date link.
 * The API routes, capture, the travel/career tools and memory control all go
 * through these, so reminders always follow the items they belong to.
 *
 * @module services/work-and-places/record
 */

import { createLogger } from '../../utils/safe-logger.js';
import { failure, success, type Result } from '../../types/result.js';
import { removeItemDate, syncItemDate } from './dates-link.js';
import {
  deleteAllLifeItems,
  deleteLifeItem,
  editLifeItem,
  listLifeItems,
  removeLifeProvenance,
  setLifeItemField,
  upsertLifeItem,
  type EditError,
} from './store.js';
import type {
  LifeArea,
  LifeInput,
  LifeItem,
  LifePatch,
  TombstoneReason,
  UpsertResult,
} from './types.js';

const log = createLogger({ module: 'WorkAndPlaces' });

async function withDate(userId: string, item: LifeItem): Promise<LifeItem> {
  const dateId = await syncItemDate(userId, item);
  if (dateId === item.dateId) return item;
  return setLifeItemField(userId, item, { dateId });
}

/** Record one item (capture or tool) and keep its reminder in step. Never throws. */
export async function recordLifeItem(userId: string, input: LifeInput): Promise<UpsertResult> {
  const result = await upsertLifeItem(userId, input);
  if (!result.item || (result.outcome !== 'created' && result.outcome !== 'updated')) return result;
  try {
    return { ...result, item: await withDate(userId, result.item) };
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not link reminder');
    return result;
  }
}

/** Something the user added on the page: theirs, and never re-guessed by capture. */
export function createUserLifeItem(
  userId: string,
  input: Omit<LifeInput, 'source' | 'confidence'>
): Promise<UpsertResult> {
  return recordLifeItem(userId, { ...input, source: 'user', confidence: 1 });
}

export async function editUserLifeItem(
  userId: string,
  area: LifeArea,
  id: string,
  patch: LifePatch
): Promise<Result<LifeItem, EditError>> {
  const edited = await editLifeItem(userId, area, id, patch);
  if (!edited.success) return edited;
  try {
    return success(await withDate(userId, edited.data));
  } catch {
    return edited;
  }
}

/** Delete one item (page, voice forget), tombstone it and cancel its reminder. */
export async function forgetLifeItem(
  userId: string,
  area: LifeArea,
  id: string,
  reason: TombstoneReason = 'user_deleted'
): Promise<Result<LifeItem, 'not_found' | 'storage'>> {
  try {
    const deleted = await deleteLifeItem(userId, area, id, reason);
    if (!deleted) return failure('not_found');
    await removeItemDate(userId, deleted, reason);
    return success(deleted);
  } catch (error) {
    log.warn({ userId, id, error: String(error) }, 'Could not delete work/places item');
    return failure('storage');
  }
}

/** Conversation-delete cascade. Returns items changed. */
export async function deleteWorkAndPlacesFor(
  userId: string,
  conversationId: string
): Promise<number> {
  const { changed, deleted } = await removeLifeProvenance(
    userId,
    (i) => i.sourceConversationIds.includes(conversationId),
    (i) => ({
      ...i,
      sourceConversationIds: i.sourceConversationIds.filter((c) => c !== conversationId),
    })
  );
  for (const item of deleted) await removeItemDate(userId, item, 'conversation_deleted');
  return changed;
}

/** Fact delete/correction cascade: items derived only from those facts go too. */
export async function deleteWorkAndPlacesForFacts(
  userId: string,
  factIds: readonly string[]
): Promise<number> {
  const ids = new Set(factIds);
  const { changed, deleted } = await removeLifeProvenance(
    userId,
    (i) => i.sourceFactIds.some((f) => ids.has(f)),
    (i) => ({ ...i, sourceFactIds: i.sourceFactIds.filter((f) => !ids.has(f)) })
  );
  for (const item of deleted) await removeItemDate(userId, item, 'conversation_deleted');
  return changed;
}

/** "Delete all my memory" / account erasure for one area. */
export function deleteAllWorkAndPlaces(userId: string, area?: LifeArea): Promise<number> {
  return deleteAllLifeItems(userId, area);
}

export async function exportLifeArea(
  userId: string,
  area: LifeArea
): Promise<{ items: LifeItem[]; exportedAt: string }> {
  return { items: await listLifeItems(userId, area), exportedAt: new Date().toISOString() };
}

const KIND_LABEL: Readonly<Record<string, string>> = {
  job: 'your job',
  project: 'the project',
  win: 'the win',
  stress: 'the stress',
  goal: 'your goal',
  event: 'the',
  application: 'your application',
  home: 'where you live',
  trip: 'your trip',
  favorite: 'your favourite place',
  meaningful: 'the place',
  bucket_list: 'your bucket-list place',
};

/**
 * Voice forget search: "forget that I work at Acme", "forget my Lisbon trip".
 * `score(text)` is memory control's lexical matcher, so all domains rank alike.
 */
export async function findLifeItems(
  userId: string,
  area: LifeArea,
  score: (candidate: string) => number
): Promise<Array<{ id: string; label: string; score: number }>> {
  const items = await listLifeItems(userId, area);
  return items
    .map((i) => {
      const haystack = [i.title, i.employer, i.role, i.place, i.meaning, i.kind]
        .filter(Boolean)
        .join(' ');
      return {
        id: i.id,
        label: `${KIND_LABEL[i.kind] ?? 'the'} "${i.title}"`,
        score: score(haystack),
      };
    })
    .filter((m) => m.score >= 0.5);
}
