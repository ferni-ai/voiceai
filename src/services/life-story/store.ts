/**
 * Firestore persistence for life story and beliefs memory.
 *
 * Paths: `bogle_users/{uid}/life_story/{id}`, `bogle_users/{uid}/beliefs_memory/{id}`.
 * Tombstones: `bogle_users/{uid}/memory_tombstones/{id}` (kind 'story' | 'belief').
 *
 * Rules:
 * - Re-learning the same thing (or retelling the same story in other words)
 *   updates one document and adds the conversation to `sourceConversationIds`.
 * - A user-edited item is never changed by capture; it only gains provenance.
 * - A deleted item is tombstoned; capture skips it. The user adding it again
 *   from the page clears the tombstone.
 * - Beliefs are written by capture only with the user's `beliefs` consent; a
 *   story whose words touch a switched-off sensitive category is not stored.
 *
 * @module services/life-story/store
 */

import type { Firestore } from '@google-cloud/firestore';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { failure, success, type Result } from '../../types/result.js';
import { beliefsEnabled, textAllowed } from './consent.js';
import {
  cleanText,
  decideMerge,
  findMatch,
  isNarrativeKind,
  isSameStory,
  isValidStoryDate,
  itemIdFor,
  itemKeyFor,
  LIMITS,
  validateInput,
} from './rules.js';
import {
  BELIEF_KINDS,
  BELIEFS_COLLECTION,
  STORY_COLLECTION,
  STORY_KINDS,
  TOMBSTONE_COLLECTION,
  USERS_COLLECTION,
  type BeliefItem,
  type ItemArea,
  type ItemInput,
  type ItemPatch,
  type LinkedPerson,
  type MemoryItem,
  type StoryItem,
  type TombstoneReason,
  type UpsertResult,
} from './types.js';

const log = createLogger({ module: 'LifeStoryStore' });

const COLLECTIONS: Readonly<Record<ItemArea, string>> = {
  story: STORY_COLLECTION,
  beliefs: BELIEFS_COLLECTION,
};

function db(): Firestore | null {
  return getFirestoreDb();
}

function col(fs: Firestore, userId: string, area: ItemArea) {
  return fs.collection(USERS_COLLECTION).doc(userId).collection(COLLECTIONS[area]);
}

function tombstone(fs: Firestore, userId: string, id: string) {
  return fs.collection(USERS_COLLECTION).doc(userId).collection(TOMBSTONE_COLLECTION).doc(id);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function iso(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date(0).toISOString();
}

const opt = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

function people(value: unknown): LinkedPerson[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .filter((p): p is { name: string; personId?: unknown } => !!p && typeof p.name === 'string')
    .map((p) => ({ name: p.name, ...(opt(p.personId) ? { personId: p.personId as string } : {}) }));
  return out.length ? out : undefined;
}

/** Parse a stored document defensively. Null for anything that isn't ours. */
export function parseItemDoc(
  area: ItemArea,
  id: string,
  data: Record<string, unknown> | undefined
): MemoryItem | null {
  if (!data || typeof data.kind !== 'string' || typeof data.key !== 'string') return null;
  const kinds: readonly string[] = area === 'story' ? STORY_KINDS : BELIEF_KINDS;
  if (!kinds.includes(data.kind)) return null;
  const base = {
    id,
    key: data.key,
    title: typeof data.title === 'string' ? data.title : data.key,
    detail: opt(data.detail),
    source:
      data.source === 'user' || data.source === 'stated'
        ? (data.source as 'user' | 'stated')
        : ('inferred' as const),
    confidence: typeof data.confidence === 'number' ? data.confidence : 0.5,
    userEdited: data.userEdited === true,
    editedAt: data.editedAt ? iso(data.editedAt) : undefined,
    sourceConversationIds: strings(data.sourceConversationIds),
    sourceFactIds: strings(data.sourceFactIds),
    mentions: typeof data.mentions === 'number' ? data.mentions : 1,
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
    lastMentionedAt: iso(data.lastMentionedAt ?? data.updatedAt),
  };
  if (area === 'beliefs') {
    return { ...base, area: 'beliefs', kind: data.kind as BeliefItem['kind'] };
  }
  const place =
    data.place && typeof (data.place as { name?: unknown }).name === 'string'
      ? {
          name: (data.place as { name: string }).name,
          ...(opt((data.place as { placeId?: unknown }).placeId)
            ? { placeId: (data.place as { placeId: string }).placeId }
            : {}),
        }
      : undefined;
  const themes = strings(data.themes);
  return {
    ...base,
    area: 'story',
    kind: data.kind as StoryItem['kind'],
    period: opt(data.period),
    date: isValidStoryDate(data.date) ? data.date : undefined,
    people: people(data.people),
    place,
    themes: themes.length ? themes : undefined,
    dateId: opt(data.dateId),
  };
}

function toDoc(item: MemoryItem): Record<string, unknown> {
  // JSON round-trip drops undefined (Firestore rejects it).
  const doc = JSON.parse(JSON.stringify(item)) as Record<string, unknown>;
  delete doc.id;
  return doc;
}

export async function saveItem(userId: string, item: MemoryItem): Promise<void> {
  const fs = db();
  if (fs) await col(fs, userId, item.area).doc(item.id).set(toDoc(item));
}

/** Everything stored for one area, newest mention first. */
export type AreaItem<A extends ItemArea> = A extends 'story' ? StoryItem : BeliefItem;

export async function listItems<A extends ItemArea>(
  userId: string,
  area: A
): Promise<AreaItem<A>[]> {
  return (await listAreaItems(userId, area)) as AreaItem<A>[];
}

async function listAreaItems(userId: string, area: ItemArea): Promise<MemoryItem[]> {
  const fs = db();
  if (!fs || !userId) return [];
  try {
    const snap = await col(fs, userId, area).get();
    const items: MemoryItem[] = [];
    for (const doc of snap.docs ?? []) {
      const parsed = parseItemDoc(area, doc.id, doc.data() as Record<string, unknown>);
      if (parsed) items.push(parsed);
    }
    return items.sort((a, b) => b.lastMentionedAt.localeCompare(a.lastMentionedAt));
  } catch (error) {
    log.warn({ userId, area, error: String(error) }, 'Could not load life story memory');
    return [];
  }
}

export async function getItem(
  userId: string,
  area: ItemArea,
  id: string
): Promise<MemoryItem | null> {
  const fs = db();
  if (!fs) return null;
  const snap = await col(fs, userId, area).doc(id).get();
  return snap.exists ? parseItemDoc(area, id, snap.data() as Record<string, unknown>) : null;
}

/**
 * Forgotten stories, by wording: a story is retold in new words, so its
 * deterministic id alone can't keep it forgotten. Kept in the tombstones
 * collection (cleared with it by "delete everything").
 */
const FORGOTTEN_STORIES_DOC = 'story_forgotten_wordings';
const MAX_FORGOTTEN = 200;

async function forgottenStories(fs: Firestore, userId: string): Promise<string[]> {
  try {
    const snap = await tombstone(fs, userId, FORGOTTEN_STORIES_DOC).get();
    return strings(snap.data()?.titles);
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not read forgotten stories');
    return [];
  }
}

async function setForgottenStories(fs: Firestore, userId: string, titles: string[]): Promise<void> {
  const ref = tombstone(fs, userId, FORGOTTEN_STORIES_DOC);
  if (titles.length === 0) await ref.delete();
  else
    await ref.set({
      titles: titles.slice(-MAX_FORGOTTEN),
      kind: 'story',
      updatedAt: new Date().toISOString(),
    });
}

async function isForgottenStory(fs: Firestore, userId: string, text: string): Promise<boolean> {
  return (await forgottenStories(fs, userId)).some((t) => isSameStory(t, text));
}

async function isTombstoned(fs: Firestore, userId: string, id: string): Promise<boolean> {
  try {
    return (await tombstone(fs, userId, id).get()).exists === true;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Tombstone check failed; skipping write');
    return true;
  }
}

const union = (list: readonly string[], add: string | undefined): string[] =>
  add && !list.includes(add) ? [...list, add] : [...list];

function mergedPeople(
  prev: readonly LinkedPerson[] | undefined,
  names: readonly string[] | undefined
): LinkedPerson[] | undefined {
  const out = [...(prev ?? [])];
  for (const name of names ?? []) {
    if (!out.some((p) => p.name.toLowerCase() === name.toLowerCase())) out.push({ name });
  }
  return out.length ? out : undefined;
}

function build(
  existing: MemoryItem | undefined,
  input: ItemInput,
  id: string,
  key: string,
  nowIso: string,
  mode: 'create' | 'replace' | 'reinforce' | 'provenance'
): MemoryItem {
  const conversations = union(existing?.sourceConversationIds ?? [], input.conversationId);
  const facts = union(existing?.sourceFactIds ?? [], input.factId);
  const isNewTelling =
    !!input.conversationId &&
    !(existing?.sourceConversationIds ?? []).includes(input.conversationId);
  const common = {
    id,
    key: existing?.key ?? key,
    sourceConversationIds: conversations,
    sourceFactIds: facts,
    createdAt: existing?.createdAt ?? nowIso,
    mentions: (existing?.mentions ?? 0) + (existing && !isNewTelling ? 0 : 1),
  };
  if (mode === 'provenance' && existing)
    return { ...existing, ...common, mentions: existing.mentions };
  const replace = mode === 'create' || mode === 'replace';
  const title = replace ? input.title : (existing?.title ?? input.title);
  const detail = replace ? (input.detail ?? existing?.detail) : (existing?.detail ?? input.detail);
  const shared = {
    ...common,
    title,
    detail,
    source: replace ? input.source : (existing?.source ?? input.source),
    confidence: Math.min(
      1,
      Math.max(existing?.confidence ?? 0, input.confidence) + (existing ? 0.05 : 0)
    ),
    userEdited: input.source === 'user' ? false : (existing?.userEdited ?? false),
    updatedAt: nowIso,
    lastMentionedAt: nowIso,
  };
  if (input.area === 'beliefs') {
    return { ...shared, area: 'beliefs', kind: input.kind };
  }
  const prev = existing?.area === 'story' ? existing : undefined;
  return {
    ...shared,
    area: 'story',
    kind: replace ? input.kind : (prev?.kind ?? input.kind),
    period: replace ? (input.period ?? prev?.period) : (prev?.period ?? input.period),
    date: replace ? (input.date ?? prev?.date) : (prev?.date ?? input.date),
    people: mergedPeople(prev?.people, input.people),
    place: prev?.place ?? (input.place ? { name: input.place } : undefined),
    themes: [...new Set([...(prev?.themes ?? []), ...(input.themes ?? [])])].slice(0, 6),
    dateId: prev?.dateId,
  };
}

/**
 * Record what capture (or the page, with `source: 'user'`) learned.
 * Never throws; storage problems come back as `invalid`.
 */
export async function upsertItem(userId: string, raw: ItemInput): Promise<UpsertResult> {
  if (!userId || userId === 'anonymous') return { outcome: 'invalid', reason: 'no user' };
  const checked = validateInput(raw);
  if (!checked.ok) {
    return { outcome: 'invalid', reason: `${checked.error.field}: ${checked.error.message}` };
  }
  const input = checked.value;
  if (input.source !== 'user') {
    if (input.area === 'beliefs' && !(await beliefsEnabled(userId))) {
      return { outcome: 'skipped_no_consent' };
    }
    if (
      input.area === 'story' &&
      !(await textAllowed(userId, `${input.title} ${input.detail ?? ''}`))
    ) {
      return { outcome: 'skipped_no_consent' };
    }
  }
  const fs = db();
  const nowIso = new Date().toISOString();
  try {
    const items = await listItems(userId, input.area);
    const key = itemKeyFor(input);
    const match = findMatch(items, input, key);
    const id = match?.id ?? itemIdFor(input.area, key);
    const narrative = input.area === 'story' && isNarrativeKind(input.kind);
    if (fs) {
      if (input.source === 'user') {
        await tombstone(fs, userId, id).delete();
        if (narrative) {
          const kept = (await forgottenStories(fs, userId)).filter(
            (t) => !isSameStory(t, input.title)
          );
          await setForgottenStories(fs, userId, kept);
        }
      } else if (await isTombstoned(fs, userId, id)) {
        return { outcome: 'skipped_tombstoned' };
      } else if (narrative && !match && (await isForgottenStory(fs, userId, input.title))) {
        return { outcome: 'skipped_tombstoned' };
      }
    }
    const decision = decideMerge(match, input);
    const next = build(match, input, id, key, nowIso, decision);
    await saveItem(userId, next);
    if (decision === 'provenance') return { outcome: 'skipped_user_edited', item: next };
    const outcome =
      decision === 'create' ? 'created' : decision === 'replace' ? 'updated' : 'reinforced';
    return { outcome, item: next };
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not save life story memory');
    return { outcome: 'invalid', reason: 'storage unavailable' };
  }
}

export type EditError = 'not_found' | 'invalid' | 'storage';

/** A user edit from the page: always wins and marks the item as the user's. */
export async function editItem(
  userId: string,
  area: ItemArea,
  id: string,
  patch: ItemPatch
): Promise<Result<MemoryItem, EditError>> {
  const existing = await getItem(userId, area, id).catch(() => null);
  if (!existing) return failure('not_found');
  if (patch.date !== undefined && patch.date !== null && !isValidStoryDate(patch.date)) {
    return failure('invalid');
  }
  const title = patch.title === undefined ? existing.title : cleanText(patch.title, LIMITS.title);
  if (!title || title.length < 2) return failure('invalid');
  const nullable = (v: string | null | undefined, prev: string | undefined, max: number) =>
    v === null ? undefined : v === undefined ? prev : cleanText(v, max) || undefined;
  const nowIso = new Date().toISOString();
  const common = {
    title,
    detail: nullable(patch.detail, existing.detail, LIMITS.detail),
    confidence: 1,
    userEdited: true,
    editedAt: nowIso,
    updatedAt: nowIso,
  };
  const next: MemoryItem =
    existing.area === 'story'
      ? {
          ...existing,
          ...common,
          period: nullable(patch.period, existing.period, LIMITS.period),
          date: patch.date === null ? undefined : (patch.date ?? existing.date),
        }
      : { ...existing, ...common };
  try {
    await saveItem(userId, JSON.parse(JSON.stringify(next)) as MemoryItem);
  } catch (error) {
    log.warn({ userId, id, error: String(error) }, 'Could not save edit');
    return failure('storage');
  }
  return success(next);
}

/** Delete one item and tombstone it so capture can't bring it back. */
export async function deleteItem(
  userId: string,
  area: ItemArea,
  id: string,
  reason: TombstoneReason = 'user_deleted'
): Promise<MemoryItem | null> {
  const fs = db();
  if (!fs) return null;
  const existing = await getItem(userId, area, id);
  if (!existing) return null;
  await tombstone(fs, userId, id).set({
    createdAt: new Date().toISOString(),
    reason,
    kind: area === 'story' ? 'story' : 'belief',
    key: existing.key,
  });
  if (existing.area === 'story' && isNarrativeKind(existing.kind)) {
    await setForgottenStories(fs, userId, [
      ...(await forgottenStories(fs, userId)),
      existing.title,
    ]);
  }
  await col(fs, userId, area).doc(id).delete();
  return existing;
}

/**
 * Drop a conversation (or facts) from provenance. An automated item left with
 * no evidence is deleted and tombstoned; user-edited items stay.
 */
export async function removeProvenance(
  userId: string,
  area: ItemArea,
  matches: (item: MemoryItem) => boolean,
  strip: (item: MemoryItem) => MemoryItem
): Promise<{ changed: number; deleted: MemoryItem[] }> {
  const deleted: MemoryItem[] = [];
  let changed = 0;
  for (const item of await listItems(userId, area)) {
    if (!matches(item)) continue;
    const next = strip(item);
    changed += 1;
    const orphan =
      !next.userEdited &&
      next.source !== 'user' &&
      next.sourceConversationIds.length === 0 &&
      next.sourceFactIds.length === 0;
    if (orphan) {
      await deleteItem(userId, area, item.id, 'conversation_deleted');
      deleted.push(item);
    } else {
      await saveItem(userId, next);
    }
  }
  return { changed, deleted };
}

/** Wipe one area. Returns documents removed. */
export async function deleteAllItems(userId: string, area: ItemArea): Promise<number> {
  const fs = db();
  if (!fs) return 0;
  const snap = await col(fs, userId, area).get();
  let removed = 0;
  for (const doc of snap.docs ?? []) {
    await doc.ref.delete();
    removed += 1;
  }
  return removed;
}

export async function countItems(userId: string, area: ItemArea): Promise<number> {
  return (await listItems(userId, area)).length;
}
