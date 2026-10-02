/**
 * Firestore persistence for work & places memory.
 *
 * Paths: `bogle_users/{uid}/work_memory/{id}`, `bogle_users/{uid}/place_memory/{id}`.
 * Tombstones: `bogle_users/{uid}/memory_tombstones/{id}` (kind 'work' | 'place').
 *
 * Rules:
 * - Re-learning the same thing upserts one document (deterministic id) and
 *   adds the conversation to `sourceConversationIds`.
 * - A user-edited item is never changed by capture; it only gains provenance.
 * - A deleted item is tombstoned; capture skips it. The user adding it again
 *   from the page clears the tombstone.
 * - History is kept: a new current job (or home) moves the previous current
 *   one to `past` instead of overwriting it.
 *
 * @module services/work-and-places/store
 */

import type { Firestore } from '@google-cloud/firestore';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { failure, success, type Result } from '../../types/result.js';
import { isAreaEnabled } from './consent.js';
import {
  cleanText,
  decideMerge,
  isValidLifeDate,
  KIND_STATUSES,
  LIMITS,
  lifeItemIdFor,
  lifeKeyFor,
  normalizeSubject,
  validateLifeInput,
} from './rules.js';
import {
  AREA_COLLECTIONS,
  TOMBSTONE_COLLECTION,
  USERS_COLLECTION,
  type LifeArea,
  type LifeInput,
  type LifeItem,
  type LifePatch,
  type TombstoneReason,
  type UpsertResult,
} from './types.js';

const log = createLogger({ module: 'WorkAndPlacesStore' });

const AREAS: readonly LifeArea[] = ['work', 'places'];
const RECENT_TRIP_MS = 120 * 24 * 60 * 60 * 1000;

function db(): Firestore | null {
  return getFirestoreDb();
}

function col(fs: Firestore, userId: string, area: LifeArea) {
  return fs.collection(USERS_COLLECTION).doc(userId).collection(AREA_COLLECTIONS[area]);
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

/** Parse a stored document defensively. Null for anything that isn't ours. */
export function parseLifeDoc(
  area: LifeArea,
  id: string,
  data: Record<string, unknown> | undefined
): LifeItem | null {
  if (!data || typeof data.kind !== 'string' || typeof data.key !== 'string') return null;
  const kind = data.kind as LifeItem['kind'];
  const statuses = KIND_STATUSES[kind];
  if (!statuses) return null;
  const opt = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
  const people = strings(data.withPeople);
  const roles = strings(data.previousRoles);
  return {
    id,
    area,
    kind,
    key: data.key,
    title: typeof data.title === 'string' ? data.title : data.key,
    status: statuses.includes(data.status as LifeItem['status'])
      ? (data.status as LifeItem['status'])
      : statuses[0],
    employer: opt(data.employer),
    role: opt(data.role),
    team: opt(data.team),
    previousRoles: roles.length ? roles : undefined,
    eventType: opt(data.eventType) as LifeItem['eventType'],
    place: opt(data.place),
    category: opt(data.category) as LifeItem['category'],
    meaning: opt(data.meaning),
    withPeople: people.length ? people : undefined,
    entityId: opt(data.entityId),
    startDate: isValidLifeDate(data.startDate) ? data.startDate : undefined,
    endDate: isValidLifeDate(data.endDate) ? data.endDate : undefined,
    dateId: opt(data.dateId),
    notes: opt(data.notes),
    source: data.source === 'user' || data.source === 'stated' ? data.source : 'inferred',
    confidence: typeof data.confidence === 'number' ? data.confidence : 0.5,
    userEdited: data.userEdited === true,
    sourceConversationIds: strings(data.sourceConversationIds),
    sourceFactIds: strings(data.sourceFactIds),
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
    lastMentionedAt: iso(data.lastMentionedAt ?? data.updatedAt),
    editedAt: data.editedAt ? iso(data.editedAt) : undefined,
  };
}

function toDoc(item: LifeItem): Record<string, unknown> {
  // JSON round-trip drops undefined (Firestore rejects it).
  const doc = JSON.parse(JSON.stringify(item)) as Record<string, unknown>;
  delete doc.id;
  return doc;
}

async function save(fs: Firestore | null, userId: string, item: LifeItem): Promise<void> {
  if (fs) await col(fs, userId, item.area).doc(item.id).set(toDoc(item));
}

/** Everything stored for one area, newest mention first. */
export async function listLifeItems(userId: string, area: LifeArea): Promise<LifeItem[]> {
  const fs = db();
  if (!fs || !userId) return [];
  try {
    const snap = await col(fs, userId, area).get();
    const items: LifeItem[] = [];
    for (const doc of snap.docs ?? []) {
      const parsed = parseLifeDoc(area, doc.id, doc.data() as Record<string, unknown>);
      if (parsed) items.push(parsed);
    }
    return items.sort((a, b) => b.lastMentionedAt.localeCompare(a.lastMentionedAt));
  } catch (error) {
    log.warn({ userId, area, error: String(error) }, 'Could not load work/places memory');
    return [];
  }
}

export async function getLifeItem(
  userId: string,
  area: LifeArea,
  id: string
): Promise<LifeItem | null> {
  const fs = db();
  if (!fs) return null;
  const snap = await col(fs, userId, area).doc(id).get();
  return snap.exists ? parseLifeDoc(area, id, snap.data() as Record<string, unknown>) : null;
}

async function isTombstoned(fs: Firestore, userId: string, id: string): Promise<boolean> {
  try {
    return (await tombstone(fs, userId, id).get()).exists === true;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Tombstone check failed; skipping write');
    return true;
  }
}

/** A trip mentioned without a date belongs to the planned/recent trip to the same place. */
function resolveKey(items: readonly LifeItem[], input: LifeInput, nowMs: number): string {
  if (input.kind !== 'trip' || input.startDate) return lifeKeyFor(input);
  const place = normalizeSubject(input.subject);
  const match = items
    .filter((i) => i.kind === 'trip' && i.key.startsWith(`trip:${place}:`))
    .find((i) => i.status === 'planned' || nowMs - Date.parse(i.lastMentionedAt) < RECENT_TRIP_MS);
  return match ? match.key : lifeKeyFor(input);
}

function monthOf(nowIso: string): string {
  return nowIso.slice(0, 7);
}

/** A new current job / home moves the previous current ones to the past (history kept). */
async function supersede(
  fs: Firestore | null,
  userId: string,
  items: readonly LifeItem[],
  winner: LifeItem,
  nowIso: string
): Promise<LifeItem[]> {
  if ((winner.kind !== 'job' && winner.kind !== 'home') || winner.status !== 'current') return [];
  const out: LifeItem[] = [];
  for (const other of items) {
    if (other.id === winner.id || other.kind !== winner.kind || other.status !== 'current') {
      continue;
    }
    if (other.userEdited) continue; // the user said it's current; don't second-guess
    if (winner.kind === 'job' && !other.employer && winner.employer) {
      // A role we knew before the employer ("I'm a nurse", then "I work at Mercy"):
      // same job, so fold it in instead of calling it a past job.
      const merged: LifeItem = {
        ...winner,
        role: winner.role ?? other.role,
        title: winner.role ? winner.title : `${other.role ?? other.title} at ${winner.employer}`,
        sourceConversationIds: [
          ...new Set([...winner.sourceConversationIds, ...other.sourceConversationIds]),
        ],
        sourceFactIds: [...new Set([...winner.sourceFactIds, ...other.sourceFactIds])],
      };
      await save(fs, userId, merged);
      if (fs) await col(fs, userId, 'work').doc(other.id).delete();
      continue;
    }
    const moved: LifeItem = {
      ...other,
      status: 'past',
      endDate: other.endDate ?? winner.startDate ?? monthOf(nowIso),
      updatedAt: nowIso,
    };
    await save(fs, userId, moved);
    out.push(moved);
  }
  return out;
}

/**
 * Record what capture (or the page, with `source: 'user'`) learned.
 * Never throws; storage problems come back as `invalid`.
 */
export async function upsertLifeItem(userId: string, raw: LifeInput): Promise<UpsertResult> {
  if (!userId || userId === 'anonymous') return { outcome: 'invalid', reason: 'no user' };
  const checked = validateLifeInput(raw);
  if (!checked.ok) {
    return { outcome: 'invalid', reason: `${checked.error.field}: ${checked.error.message}` };
  }
  const input = checked.value;
  if (input.source !== 'user' && !(await isAreaEnabled(userId, input.area))) {
    return { outcome: 'skipped_disabled' };
  }
  const fs = db();
  const nowIso = new Date().toISOString();
  try {
    const items = await listLifeItems(userId, input.area);
    const key = resolveKey(items, input, Date.parse(nowIso));
    const id = lifeItemIdFor(input.area, key);
    if (fs) {
      if (input.source === 'user') {
        await tombstone(fs, userId, id).delete();
      } else if (await isTombstoned(fs, userId, id)) {
        return { outcome: 'skipped_tombstoned' };
      }
    }
    const existing = items.find((i) => i.id === id);
    const decision = decideMerge(existing, input, id, key, nowIso);
    await save(fs, userId, decision.next);
    if (decision.kind === 'provenance') {
      return { outcome: 'skipped_user_edited', item: decision.next };
    }
    // Only news of a (new) current job / home ends the previous one; re-mentions don't.
    const isNews = input.status === 'current' && existing?.status !== 'current';
    const superseded =
      input.additional || !isNews ? [] : await supersede(fs, userId, items, decision.next, nowIso);
    const outcome =
      decision.kind === 'create'
        ? 'created'
        : decision.kind === 'replace'
          ? 'updated'
          : 'reinforced';
    return { outcome, item: decision.next, ...(superseded.length ? { superseded } : {}) };
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not save work/places memory');
    return { outcome: 'invalid', reason: 'storage unavailable' };
  }
}

/** Store a field (dateId) without touching precedence. */
export async function setLifeItemField(
  userId: string,
  item: LifeItem,
  fields: Partial<Pick<LifeItem, 'dateId'>>
): Promise<LifeItem> {
  const next = { ...item, ...fields };
  await save(db(), userId, next);
  return next;
}

export type EditError = 'not_found' | 'invalid' | 'storage';

/** A user edit from the page: always wins and marks the item as the user's. */
export async function editLifeItem(
  userId: string,
  area: LifeArea,
  id: string,
  patch: LifePatch
): Promise<Result<LifeItem, EditError>> {
  const existing = await getLifeItem(userId, area, id).catch(() => null);
  if (!existing) return failure('not_found');
  if (patch.status !== undefined && !KIND_STATUSES[existing.kind].includes(patch.status)) {
    return failure('invalid');
  }
  for (const field of ['startDate', 'endDate'] as const) {
    const v = patch[field];
    if (v !== undefined && v !== null && !isValidLifeDate(v)) return failure('invalid');
  }
  const text = (v: string | undefined, max: number, prev: string | undefined) =>
    v === undefined ? prev : cleanText(v, max) || undefined;
  const title = text(patch.title, LIMITS.title, existing.title);
  if (!title) return failure('invalid');
  const nowIso = new Date().toISOString();
  const nullable = (v: string | null | undefined, prev: string | undefined, max: number) =>
    v === null ? undefined : v === undefined ? prev : cleanText(v, max) || undefined;
  const next: LifeItem = JSON.parse(
    JSON.stringify({
      ...existing,
      title,
      status: patch.status ?? existing.status,
      employer: text(patch.employer, LIMITS.name, existing.employer),
      role: text(patch.role, LIMITS.name, existing.role),
      team: text(patch.team, LIMITS.name, existing.team),
      place: text(patch.place, LIMITS.name, existing.place),
      meaning: text(patch.meaning, LIMITS.title, existing.meaning),
      startDate: patch.startDate === null ? undefined : (patch.startDate ?? existing.startDate),
      endDate: patch.endDate === null ? undefined : (patch.endDate ?? existing.endDate),
      notes: nullable(patch.notes, existing.notes, LIMITS.notes),
      source: 'user',
      confidence: 1,
      userEdited: true,
      editedAt: nowIso,
      updatedAt: nowIso,
    })
  ) as LifeItem;
  try {
    await save(db(), userId, next);
  } catch (error) {
    log.warn({ userId, id, error: String(error) }, 'Could not save edit');
    return failure('storage');
  }
  return success(next);
}

/** Delete one item and tombstone it so capture can't bring it back. */
export async function deleteLifeItem(
  userId: string,
  area: LifeArea,
  id: string,
  reason: TombstoneReason = 'user_deleted'
): Promise<LifeItem | null> {
  const fs = db();
  if (!fs) return null;
  const existing = await getLifeItem(userId, area, id);
  if (!existing) return null;
  await tombstone(fs, userId, id).set({
    createdAt: new Date().toISOString(),
    reason,
    kind: area === 'work' ? 'work' : 'place',
    key: existing.key,
  });
  await col(fs, userId, area).doc(id).delete();
  return existing;
}

/**
 * Drop a conversation (or fact) from provenance. An automated item left with
 * no evidence is deleted and tombstoned; user-edited items stay.
 * Returns [items changed, items deleted].
 */
export async function removeLifeProvenance(
  userId: string,
  matches: (item: LifeItem) => boolean,
  strip: (item: LifeItem) => LifeItem
): Promise<{ changed: number; deleted: LifeItem[] }> {
  const fs = db();
  const deleted: LifeItem[] = [];
  let changed = 0;
  for (const area of AREAS) {
    for (const item of await listLifeItems(userId, area)) {
      if (!matches(item)) continue;
      const next = strip(item);
      changed += 1;
      if (
        !next.userEdited &&
        next.sourceConversationIds.length === 0 &&
        next.sourceFactIds.length === 0
      ) {
        await deleteLifeItem(userId, area, item.id, 'conversation_deleted');
        deleted.push(item);
      } else {
        await save(fs, userId, next);
      }
    }
  }
  return { changed, deleted };
}

/** Wipe one area (or both). Returns documents removed. */
export async function deleteAllLifeItems(userId: string, area?: LifeArea): Promise<number> {
  const fs = db();
  if (!fs) return 0;
  let removed = 0;
  for (const a of area ? [area] : AREAS) {
    const snap = await col(fs, userId, a).get();
    for (const doc of snap.docs ?? []) {
      await doc.ref.delete();
      removed += 1;
    }
  }
  return removed;
}
