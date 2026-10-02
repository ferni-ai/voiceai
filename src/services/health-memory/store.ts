/**
 * Firestore store for health memory items.
 *
 * Rules:
 * - Nothing is written unless the Health category is on (checked on every write).
 * - One document per (kind, subject) for ongoing things, per (kind, subject, day)
 *   for moments, so hearing the same thing again updates it.
 * - The user's edits win: automated capture only adds provenance to a
 *   `userEdited` item.
 * - Deleted stays deleted: deletes write a tombstone, capture skips tombstoned ids.
 *
 * @module services/health-memory/store
 */

import { createHash } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { failure, success, type Result } from '../../types/result.js';
import { isCategoryEnabled } from '../memory-consent/store.js';
import {
  EPISODIC_KINDS,
  HEALTH_COLLECTION,
  HEALTH_KINDS,
  TOMBSTONE_COLLECTION,
  USERS_COLLECTION,
  type HealthInput,
  type HealthItem,
  type HealthKind,
  type HealthStatus,
  type HealthTombstoneReason,
  type HealthUpsertOutcome,
} from './types.js';

const log = createLogger({ module: 'HealthMemoryStore' });

export const MAX_HEALTH_TEXT = 300;
const MAX_SUBJECT = 120;
const MAX_ITEMS = 500;

export function normalizeSubject(subject: string): string {
  return subject.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, MAX_SUBJECT);
}

export function dayOf(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** Deterministic id: `health_` + 24 hex chars. */
export function healthIdFor(kind: HealthKind, subject: string, day?: string): string {
  const key = [kind, normalizeSubject(subject), EPISODIC_KINDS.has(kind) ? (day ?? '') : '']
    .join('|')
    .replace(/\|+$/, '');
  return `health_${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
}

export function isHealthId(id: string): boolean {
  return /^health_[a-f0-9]{24}$/.test(id);
}

function db(): Firestore | null {
  return getFirestoreDb();
}

function col(fs: Firestore, userId: string) {
  return fs.collection(USERS_COLLECTION).doc(userId).collection(HEALTH_COLLECTION);
}

function tombstone(fs: Firestore, userId: string, id: string) {
  return fs.collection(USERS_COLLECTION).doc(userId).collection(TOMBSTONE_COLLECTION).doc(id);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function isKind(value: unknown): value is HealthKind {
  return typeof value === 'string' && (HEALTH_KINDS as readonly string[]).includes(value);
}

function isStatus(value: unknown): value is HealthStatus {
  return value === 'current' || value === 'past' || value === 'upcoming';
}

export function parseHealthDoc(
  id: string,
  d: Record<string, unknown> | undefined
): HealthItem | null {
  if (!d || !isKind(d.kind)) return null;
  const now = new Date(0).toISOString();
  const source = d.source;
  return {
    id,
    kind: d.kind,
    subject: str(d.subject),
    text: str(d.text),
    status: isStatus(d.status) ? d.status : 'current',
    ...(typeof d.when === 'string' ? { when: d.when } : {}),
    ...(typeof d.day === 'string' ? { day: d.day } : {}),
    confidence: typeof d.confidence === 'number' ? d.confidence : 0.5,
    source:
      source === 'user' || source === 'explicit' || source === 'tool' || source === 'inferred'
        ? source
        : 'inferred',
    sourceConversationIds: strings(d.sourceConversationIds),
    sourceFactIds: strings(d.sourceFactIds),
    mentions: typeof d.mentions === 'number' ? d.mentions : 1,
    userEdited: d.userEdited === true,
    firstMentionedAt: str(d.firstMentionedAt, now),
    lastMentionedAt: str(d.lastMentionedAt, now),
    updatedAt: str(d.updatedAt, now),
    ...(typeof d.editedAt === 'string' ? { editedAt: d.editedAt } : {}),
  };
}

function valid(input: HealthInput): boolean {
  const subject = normalizeSubject(input.subject ?? '');
  const text = (input.text ?? '').trim();
  return (
    isKind(input.kind) &&
    subject.length > 0 &&
    text.length > 0 &&
    text.length <= MAX_HEALTH_TEXT &&
    Number.isFinite(input.confidence)
  );
}

function union(list: readonly string[], add: string | undefined): string[] {
  return add && !list.includes(add) ? [...list, add] : [...list];
}

/** Record a health mention. Never throws. */
export async function upsertHealthItem(
  userId: string,
  input: HealthInput
): Promise<{ outcome: HealthUpsertOutcome; item?: HealthItem }> {
  if (!valid(input)) return { outcome: 'invalid' };
  if (!(await isCategoryEnabled(userId, 'health'))) return { outcome: 'not_consented' };
  const fs = db();
  if (!fs) return { outcome: 'failed' };

  const at = input.at ?? new Date();
  const day = EPISODIC_KINDS.has(input.kind) ? dayOf(at) : undefined;
  const id = healthIdFor(input.kind, input.subject, day);
  try {
    if ((await tombstone(fs, userId, id).get()).exists) return { outcome: 'tombstoned' };
    const ref = col(fs, userId).doc(id);
    const snap = await ref.get();
    const existing = snap.exists ? parseHealthDoc(id, snap.data()) : null;
    const now = new Date().toISOString();
    const atIso = at.toISOString();
    const sourceConversationIds = union(
      existing?.sourceConversationIds ?? [],
      input.conversationId
    );
    const sourceFactIds = union(existing?.sourceFactIds ?? [], input.factId);

    if (existing?.userEdited) {
      const changed =
        sourceConversationIds.length !== existing.sourceConversationIds.length ||
        sourceFactIds.length !== existing.sourceFactIds.length;
      if (!changed) return { outcome: 'provenance_only', item: existing };
      await ref.set({ sourceConversationIds, sourceFactIds }, { merge: true });
      return {
        outcome: 'provenance_only',
        item: { ...existing, sourceConversationIds, sourceFactIds },
      };
    }

    const confidence = Math.min(1, Math.max(0, input.confidence));
    const keepText = existing && existing.confidence > confidence;
    const item: HealthItem = {
      id,
      kind: input.kind,
      subject: normalizeSubject(input.subject),
      text: keepText ? existing.text : input.text.trim(),
      status:
        input.status ?? existing?.status ?? (input.kind === 'appointment' ? 'upcoming' : 'current'),
      ...((input.when ?? existing?.when) ? { when: input.when ?? existing?.when } : {}),
      ...(day ? { day } : {}),
      confidence: Math.max(existing?.confidence ?? 0, confidence),
      source: keepText ? existing.source : input.source,
      sourceConversationIds,
      sourceFactIds,
      mentions: (existing?.mentions ?? 0) + 1,
      userEdited: false,
      firstMentionedAt: existing?.firstMentionedAt ?? atIso,
      lastMentionedAt:
        atIso > (existing?.lastMentionedAt ?? '') ? atIso : (existing?.lastMentionedAt ?? atIso),
      updatedAt: now,
    };
    const { id: _omit, ...doc } = item;
    void _omit;
    await ref.set(doc, { merge: true });
    return { outcome: existing ? 'updated' : 'created', item };
  } catch (error) {
    log.warn({ userId, kind: input.kind, error: String(error) }, 'Health upsert failed');
    return { outcome: 'failed' };
  }
}

export async function listHealthItems(userId: string): Promise<HealthItem[]> {
  const fs = db();
  if (!fs) return [];
  try {
    const snap = await col(fs, userId).get();
    return snap.docs
      .map((d) => parseHealthDoc(d.id, d.data()))
      .filter((i): i is HealthItem => i !== null)
      .sort((a, b) => b.lastMentionedAt.localeCompare(a.lastMentionedAt))
      .slice(0, MAX_ITEMS);
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not list health items');
    return [];
  }
}

export type HealthEditError = 'not_found' | 'invalid' | 'unavailable';

export async function editHealthItem(
  userId: string,
  id: string,
  edit: { text?: string; status?: HealthStatus; when?: string }
): Promise<Result<HealthItem, HealthEditError>> {
  if (!isHealthId(id)) return failure('not_found');
  const text = edit.text?.trim();
  if (
    (edit.text !== undefined && (!text || text.length > MAX_HEALTH_TEXT)) ||
    (edit.status !== undefined && !isStatus(edit.status)) ||
    (edit.when !== undefined && edit.when.length > 120) ||
    (edit.text === undefined && edit.status === undefined && edit.when === undefined)
  ) {
    return failure('invalid');
  }
  const fs = db();
  if (!fs) return failure('unavailable');
  try {
    const ref = col(fs, userId).doc(id);
    const snap = await ref.get();
    const existing = snap.exists ? parseHealthDoc(id, snap.data()) : null;
    if (!existing) return failure('not_found');
    const now = new Date().toISOString();
    const patch = {
      ...(text ? { text } : {}),
      ...(edit.status ? { status: edit.status } : {}),
      ...(edit.when !== undefined ? { when: edit.when } : {}),
      userEdited: true,
      editedAt: now,
      updatedAt: now,
    };
    await ref.set(patch, { merge: true });
    return success({ ...existing, ...patch });
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Health edit failed');
    return failure('unavailable');
  }
}

/** Delete one item and tombstone it so capture can't add it back. */
export async function deleteHealthItem(
  userId: string,
  id: string,
  reason: HealthTombstoneReason
): Promise<boolean> {
  if (!isHealthId(id)) return false;
  const fs = db();
  if (!fs) return false;
  try {
    const ref = col(fs, userId).doc(id);
    if (!(await ref.get()).exists) return false;
    await tombstone(fs, userId, id).set({
      createdAt: new Date().toISOString(),
      reason,
      kind: 'health',
    });
    await ref.delete();
    return true;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Health delete failed');
    return false;
  }
}

/**
 * Remove a source (conversation or fact) from every item; an automated item
 * left with no source is deleted and tombstoned. User-edited items stay.
 */
async function removeProvenance(
  userId: string,
  field: 'sourceConversationIds' | 'sourceFactIds',
  ids: readonly string[],
  reason: HealthTombstoneReason
): Promise<number> {
  const fs = db();
  if (!fs || ids.length === 0) return 0;
  let changed = 0;
  for (const item of await listHealthItems(userId)) {
    const list = item[field];
    if (!list.some((x) => ids.includes(x))) continue;
    const remaining = list.filter((x) => !ids.includes(x));
    const other =
      field === 'sourceConversationIds' ? item.sourceFactIds : item.sourceConversationIds;
    if (
      !item.userEdited &&
      item.source !== 'user' &&
      remaining.length === 0 &&
      other.length === 0
    ) {
      if (await deleteHealthItem(userId, item.id, reason)) changed++;
      continue;
    }
    await col(fs, userId)
      .doc(item.id)
      .set({ [field]: remaining }, { merge: true });
    changed++;
  }
  return changed;
}

export function deleteHealthFor(userId: string, conversationId: string): Promise<number> {
  return removeProvenance(
    userId,
    'sourceConversationIds',
    [conversationId],
    'conversation_deleted'
  );
}

export function deleteHealthDerivedFromFacts(
  userId: string,
  factIds: readonly string[]
): Promise<number> {
  return removeProvenance(userId, 'sourceFactIds', factIds, 'fact_deleted');
}

/** Wipe every health item (delete-all, account erasure, "delete my health memories"). */
export async function deleteAllHealth(userId: string): Promise<number> {
  const fs = db();
  if (!fs) return 0;
  const snap = await col(fs, userId).get();
  for (const d of snap.docs) await d.ref.delete();
  return snap.docs.length;
}

export async function countHealthItems(userId: string): Promise<number> {
  const fs = db();
  if (!fs) return 0;
  return (await col(fs, userId).get()).docs.length;
}
