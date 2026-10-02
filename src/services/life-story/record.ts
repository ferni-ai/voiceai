/**
 * Life story, values and beliefs: what the page, voice forget and memory
 * control call. Every write goes through the store's precedence rules;
 * deletes tombstone; cascades keep the user's own items.
 *
 * Also covers the legacy narrative stores written by the Life Narrative
 * superhuman service (`life_chapters`, `meta/identity`): exported, removed
 * with a deleted conversation when they carry its id, and erased by
 * "delete everything".
 *
 * @module services/life-story/record
 */

import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { failure, success, type Result } from '../../types/result.js';
import { beliefsEnabled } from './consent.js';
import { linkStoryItem, removeStoryDate } from './links.js';
import { contentTokens } from './rules.js';
import {
  deleteAllItems,
  deleteItem,
  editItem,
  listItems,
  removeProvenance,
  upsertItem,
  type EditError,
} from './store.js';
import {
  LEGACY_CHAPTERS_COLLECTION,
  USERS_COLLECTION,
  type BeliefInput,
  type BeliefItem,
  type ItemArea,
  type ItemPatch,
  type MemoryItem,
  type StoryInput,
  type StoryItem,
  type TombstoneReason,
  type UpsertResult,
  type ValueItem,
} from './types.js';
import {
  deleteAllValues,
  deleteValue,
  editValue,
  listValues,
  recordValue,
  removeValueProvenance,
} from './values-store.js';

const log = createLogger({ module: 'LifeStoryRecord' });

async function forgetNarrativeCache(userId: string): Promise<void> {
  try {
    const { forgetCachedNarrative } = await import('../superhuman/life-narrative.js');
    forgetCachedNarrative(userId);
  } catch (error) {
    log.debug({ error: String(error) }, 'Narrative cache not cleared');
  }
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export interface StoryView {
  readonly items: StoryItem[];
  readonly values: ValueItem[];
  readonly updatedAt: string | null;
}

export interface BeliefsView {
  readonly enabled: boolean;
  readonly items: BeliefItem[];
  readonly updatedAt: string | null;
}

const newest = (dates: readonly string[]): string | null =>
  dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;

export async function getStoryView(userId: string): Promise<StoryView> {
  const [items, values] = await Promise.all([listItems(userId, 'story'), listValues(userId)]);
  return {
    items,
    values,
    updatedAt: newest([...items.map((i) => i.updatedAt), ...values.map((v) => v.updatedAt)]),
  };
}

export async function getBeliefsView(userId: string): Promise<BeliefsView> {
  const [enabled, items] = await Promise.all([
    beliefsEnabled(userId),
    listItems(userId, 'beliefs'),
  ]);
  return { enabled, items, updatedAt: newest(items.map((i) => i.updatedAt)) };
}

// ---------------------------------------------------------------------------
// The user's own changes (page)
// ---------------------------------------------------------------------------

export type CreateError = 'invalid' | 'storage' | 'consent_off';

/** Add from the page. Beliefs only while the Beliefs switch is on. */
export async function createUserItem(
  userId: string,
  input: Omit<StoryInput, 'source' | 'confidence'> | Omit<BeliefInput, 'source' | 'confidence'>
): Promise<Result<MemoryItem, CreateError>> {
  if (input.area === 'beliefs' && !(await beliefsEnabled(userId))) return failure('consent_off');
  const result: UpsertResult = await upsertItem(userId, {
    ...input,
    source: 'user',
    confidence: 1,
  } as StoryInput | BeliefInput);
  if (!result.item) return failure(result.reason === 'storage unavailable' ? 'storage' : 'invalid');
  const item =
    result.item.area === 'story' ? await linkStoryItem(userId, result.item) : result.item;
  return success(item);
}

export async function createUserValue(
  userId: string,
  label: string,
  statement?: string
): Promise<Result<ValueItem, CreateError>> {
  const r = await recordValue(userId, {
    label,
    statement: statement ?? label,
    source: 'user',
    confidence: 1,
  });
  if (r.outcome === 'skipped_no_consent') return failure('consent_off');
  return r.item ? success(r.item) : failure('invalid');
}

export async function editUserItem(
  userId: string,
  area: ItemArea,
  id: string,
  patch: ItemPatch
): Promise<Result<MemoryItem, EditError>> {
  const result = await editItem(userId, area, id, patch);
  if (result.success && result.data.area === 'story') {
    return success(await linkStoryItem(userId, result.data));
  }
  return result;
}

export async function editUserValue(
  userId: string,
  id: string,
  patch: { label?: string; statement?: string }
): Promise<Result<ValueItem, EditError>> {
  return editValue(userId, id, patch);
}

/** Forget one story / value / belief (page or voice). Tombstoned. */
export async function forgetItem(
  userId: string,
  id: string,
  reason: TombstoneReason = 'user_deleted'
): Promise<Result<{ deleted: true }, 'not_found' | 'storage'>> {
  try {
    if (id.startsWith('value_')) {
      return (await deleteValue(userId, id, reason))
        ? success({ deleted: true })
        : failure('not_found');
    }
    const area: ItemArea = id.startsWith('belief_') ? 'beliefs' : 'story';
    const removed = await deleteItem(userId, area, id, reason);
    if (!removed) return failure('not_found');
    if (removed.area === 'story') await removeStoryDate(userId, removed, reason);
    return success({ deleted: true });
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not forget life story item');
    return failure('storage');
  }
}

// ---------------------------------------------------------------------------
// Memory control: cascades, export, delete-all, voice forget
// ---------------------------------------------------------------------------

function without<T extends MemoryItem>(
  item: T,
  field: 'sourceConversationIds' | 'sourceFactIds',
  drop: (id: string) => boolean
): T {
  return { ...item, [field]: item[field].filter((x) => !drop(x)) };
}

async function cascade(
  userId: string,
  areas: readonly ItemArea[],
  field: 'sourceConversationIds' | 'sourceFactIds',
  ids: ReadonlySet<string>
): Promise<number> {
  let total = 0;
  for (const area of areas) {
    const r = await removeProvenance(
      userId,
      area,
      (i) => i[field].some((x) => ids.has(x)),
      (i) => without(i, field, (x) => ids.has(x))
    );
    for (const item of r.deleted)
      if (item.area === 'story') await removeStoryDate(userId, item, 'user_deleted');
    total += r.changed;
  }
  return total;
}

/** Legacy narrative chapters that carry the conversation id. */
async function deleteLegacyChaptersFor(userId: string, conversationId: string): Promise<number> {
  const fs = getFirestoreDb();
  if (!fs) return 0;
  const snap = await fs
    .collection(USERS_COLLECTION)
    .doc(userId)
    .collection(LEGACY_CHAPTERS_COLLECTION)
    .where('sourceConversationIds', 'array-contains', conversationId)
    .get();
  let changed = 0;
  for (const doc of snap.docs ?? []) {
    const data = doc.data() as Record<string, unknown>;
    const rest = (
      Array.isArray(data.sourceConversationIds) ? data.sourceConversationIds : []
    ).filter((x) => x !== conversationId);
    if (rest.length === 0) await doc.ref.delete();
    else await doc.ref.set({ ...data, sourceConversationIds: rest });
    changed += 1;
  }
  if (changed) await forgetNarrativeCache(userId);
  return changed;
}

/** Conversation deleted: story + values (and their legacy chapters). Beliefs: see deleteBeliefsFor. */
export async function deleteLifeStoryFor(userId: string, conversationId: string): Promise<number> {
  const ids = new Set([conversationId]);
  const story = await cascade(userId, ['story'], 'sourceConversationIds', ids);
  const values = await removeValueProvenance(
    userId,
    (v) => v.sourceConversationIds.includes(conversationId),
    (p) => ({ ...p, conversations: p.conversations.filter((c) => c !== conversationId) })
  );
  return story + values.changed + (await deleteLegacyChaptersFor(userId, conversationId));
}

export async function deleteBeliefsFor(userId: string, conversationId: string): Promise<number> {
  return cascade(userId, ['beliefs'], 'sourceConversationIds', new Set([conversationId]));
}

/** Facts deleted or corrected: anything derived only from them goes too. */
export async function deleteLifeStoryForFacts(
  userId: string,
  factIds: readonly string[]
): Promise<number> {
  const ids = new Set(factIds);
  const items = await cascade(userId, ['story', 'beliefs'], 'sourceFactIds', ids);
  const values = await removeValueProvenance(
    userId,
    (v) => v.sourceFactIds.some((f) => ids.has(f)),
    (p) => ({ ...p, facts: p.facts.filter((f) => !ids.has(f)) })
  );
  return items + values.changed;
}

async function legacyNarrative(
  userId: string
): Promise<{ lifeChapters: unknown[]; identity: unknown }> {
  const fs = getFirestoreDb();
  if (!fs) return { lifeChapters: [], identity: null };
  const user = fs.collection(USERS_COLLECTION).doc(userId);
  const [chapters, identity] = await Promise.all([
    user.collection(LEGACY_CHAPTERS_COLLECTION).get(),
    user.collection('meta').doc('identity').get(),
  ]);
  return {
    lifeChapters: (chapters.docs ?? []).map((d) => ({ id: d.id, ...(d.data() as object) })),
    identity: identity.exists ? (identity.data() ?? null) : null,
  };
}

export async function exportLifeStory(userId: string): Promise<Record<string, unknown>> {
  const [story, values, legacy] = await Promise.all([
    listItems(userId, 'story'),
    listValues(userId),
    legacyNarrative(userId),
  ]);
  return { story, values, ...legacy, exportedAt: new Date().toISOString() };
}

export async function exportBeliefs(userId: string): Promise<Record<string, unknown>> {
  return { items: await listItems(userId, 'beliefs'), exportedAt: new Date().toISOString() };
}

/** Story, values (and conflicts), legacy chapters and identity. */
export async function deleteAllLifeStory(userId: string): Promise<number> {
  let removed = (await deleteAllItems(userId, 'story')) + (await deleteAllValues(userId));
  const fs = getFirestoreDb();
  if (fs) {
    const user = fs.collection(USERS_COLLECTION).doc(userId);
    for (const doc of (await user.collection(LEGACY_CHAPTERS_COLLECTION).get()).docs ?? []) {
      await doc.ref.delete();
      removed += 1;
    }
    const identity = user.collection('meta').doc('identity');
    if ((await identity.get()).exists) {
      await identity.delete();
      removed += 1;
    }
  }
  await forgetNarrativeCache(userId);
  return removed;
}

export async function deleteAllBeliefs(userId: string): Promise<number> {
  return deleteAllItems(userId, 'beliefs');
}

export interface FoundItem {
  readonly id: string;
  readonly label: string;
  readonly score: number;
}

function score(query: string, text: string): number {
  const q = contentTokens(query);
  if (q.length === 0) return 0;
  const t = new Set(contentTokens(text));
  return q.filter((x) => t.has(x)).length / q.length;
}

/** Voice forget: "forget the treehouse story", "forget that I'm Catholic". */
export async function findLifeStory(userId: string, query: string): Promise<FoundItem[]> {
  const [items, values] = await Promise.all([listItems(userId, 'story'), listValues(userId)]);
  return [
    ...items.map((i) => ({
      id: i.id,
      label: `the story "${i.title}"`,
      score: score(query, `${i.title} ${i.detail ?? ''}`),
    })),
    ...values.map((v) => ({
      id: v.id,
      label: `that ${v.label} matters to you`,
      score: score(query, `${v.label} ${v.statement}`),
    })),
  ].filter((m) => m.score >= 0.5);
}

export async function findBeliefs(userId: string, query: string): Promise<FoundItem[]> {
  return (await listItems(userId, 'beliefs'))
    .map((i) => ({
      id: i.id,
      label: `"${i.title}"`,
      score: score(query, `${i.title} ${i.detail ?? ''}`),
    }))
    .filter((m) => m.score >= 0.5);
}
