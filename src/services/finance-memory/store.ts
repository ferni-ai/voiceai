/**
 * Firestore store for money memory items.
 *
 * Rules:
 * - Nothing is written unless the Money (finances) category is on, checked on
 *   every write.
 * - Secrets never land here: text and subject go through strict redaction, and
 *   an item that is nothing but a secret is refused.
 * - Amounts are kept only from the user's own words (explicit / user).
 * - One document per (kind, subject): hearing it again updates it.
 * - The user's edits win: capture only adds provenance to a `userEdited` item.
 * - Deleted stays deleted: deletes write a tombstone, capture skips it.
 *
 * @module services/finance-memory/store
 */

import { createHash } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { isOnlyRedacted, redactFinancialSecrets } from '../../utils/financial-redaction.js';
import { createLogger } from '../../utils/safe-logger.js';
import { failure, success, type Result } from '../../types/result.js';
import { isCategoryEnabled } from '../memory-consent/store.js';
import {
  FINANCE_COLLECTION,
  FINANCE_KINDS,
  FINANCE_STATUSES,
  TOMBSTONE_COLLECTION,
  USERS_COLLECTION,
  type AmountPeriod,
  type Currency,
  type FinanceAmount,
  type FinanceEdit,
  type FinanceInput,
  type FinanceItem,
  type FinanceKind,
  type FinanceStatus,
  type FinanceTombstoneReason,
  type FinanceUpsertOutcome,
} from './types.js';

const log = createLogger({ module: 'FinanceMemoryStore' });

export const MAX_FINANCE_TEXT = 240;
const MAX_SUBJECT = 80;
const MAX_ITEMS = 300;
const MAX_PROVENANCE = 100;

export function normalizeFinanceSubject(subject: string): string {
  return redactFinancialSecrets(subject, { strict: true })
    .text.toLowerCase()
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SUBJECT);
}

/** Deterministic id: `fin_` + 24 hex chars of kind + subject. */
export function financeIdFor(kind: FinanceKind, subject: string): string {
  const key = `${kind}|${normalizeFinanceSubject(subject)}`;
  return `fin_${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
}

export function isFinanceId(id: string): boolean {
  return /^fin_[a-f0-9]{24}$/.test(id);
}

/** Strict redaction + whitespace cleanup. Null when nothing but a secret is left. */
export function cleanFinanceText(text: string): string | null {
  const redacted = redactFinancialSecrets(text ?? '', { strict: true }).text;
  const clean = redacted.replace(/\s+/g, ' ').trim();
  if (!clean || isOnlyRedacted(clean)) return null;
  return clean.slice(0, MAX_FINANCE_TEXT);
}

function col(fs: Firestore, userId: string) {
  return fs.collection(USERS_COLLECTION).doc(userId).collection(FINANCE_COLLECTION);
}

function tombstone(fs: Firestore, userId: string, id: string) {
  return fs.collection(USERS_COLLECTION).doc(userId).collection(TOMBSTONE_COLLECTION).doc(id);
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

export function isFinanceKind(v: unknown): v is FinanceKind {
  return typeof v === 'string' && (FINANCE_KINDS as readonly string[]).includes(v);
}

export function isFinanceStatus(v: unknown): v is FinanceStatus {
  return typeof v === 'string' && (FINANCE_STATUSES as readonly string[]).includes(v);
}

function isPeriod(v: unknown): v is AmountPeriod {
  return v === 'week' || v === 'biweekly' || v === 'month' || v === 'year';
}

function isCurrency(v: unknown): v is Currency {
  return v === 'USD' || v === 'GBP' || v === 'EUR';
}

function parseAmountField(v: unknown): FinanceAmount | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const a = v as Record<string, unknown>;
  if (typeof a.value !== 'number' || !Number.isFinite(a.value) || a.value <= 0) return undefined;
  return {
    value: a.value,
    currency: isCurrency(a.currency) ? a.currency : 'USD',
    ...(isPeriod(a.period) ? { period: a.period } : {}),
    said: str(a.said),
  };
}

function validDay(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 31;
}

export function parseFinanceDoc(
  id: string,
  d: Record<string, unknown> | undefined
): FinanceItem | null {
  if (!d || !isFinanceKind(d.kind)) return null;
  const epoch = new Date(0).toISOString();
  const amount = parseAmountField(d.amount);
  const source = d.source === 'user' || d.source === 'explicit' ? d.source : 'inferred';
  return {
    id,
    kind: d.kind,
    subject: str(d.subject),
    text: str(d.text),
    status: isFinanceStatus(d.status) ? d.status : 'active',
    ...(amount ? { amount } : {}),
    ...(validDay(d.dueDay) ? { dueDay: d.dueDay } : {}),
    ...(typeof d.aspirationId === 'string' ? { aspirationId: d.aspirationId } : {}),
    ...(d.aspirationCreated === true ? { aspirationCreated: true } : {}),
    ...(typeof d.dateId === 'string' ? { dateId: d.dateId } : {}),
    confidence: typeof d.confidence === 'number' ? d.confidence : 0.5,
    source,
    sourceConversationIds: strings(d.sourceConversationIds),
    sourceFactIds: strings(d.sourceFactIds),
    mentions: typeof d.mentions === 'number' ? d.mentions : 1,
    userEdited: d.userEdited === true,
    firstMentionedAt: str(d.firstMentionedAt, epoch),
    lastMentionedAt: str(d.lastMentionedAt, epoch),
    updatedAt: str(d.updatedAt, epoch),
    ...(typeof d.editedAt === 'string' ? { editedAt: d.editedAt } : {}),
  };
}

function union(list: readonly string[], add: string | undefined): string[] {
  const out = add && !list.includes(add) ? [...list, add] : [...list];
  return out.slice(-MAX_PROVENANCE);
}

/** Firestore rejects undefined; drop those keys. */
function toDoc(item: FinanceItem): Record<string, unknown> {
  const { id: _id, ...rest } = item;
  void _id;
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
}

/** Record a money mention. Never throws. */
export async function upsertFinanceItem(
  userId: string,
  input: FinanceInput
): Promise<{ outcome: FinanceUpsertOutcome; item?: FinanceItem }> {
  const subject = normalizeFinanceSubject(input.subject ?? '');
  const text = cleanFinanceText(input.text ?? '');
  if (!isFinanceKind(input.kind) || !subject || !text || !Number.isFinite(input.confidence)) {
    return { outcome: 'invalid' };
  }
  if (!(await isCategoryEnabled(userId, 'finances'))) return { outcome: 'not_consented' };
  const fs = getFirestoreDb();
  if (!fs) return { outcome: 'failed' };

  const id = financeIdFor(input.kind, subject);
  try {
    if ((await tombstone(fs, userId, id).get()).exists) return { outcome: 'tombstoned' };
    const ref = col(fs, userId).doc(id);
    const snap = await ref.get();
    const existing = snap.exists ? parseFinanceDoc(id, snap.data()) : null;
    const sourceConversationIds = union(
      existing?.sourceConversationIds ?? [],
      input.conversationId
    );
    const sourceFactIds = union(existing?.sourceFactIds ?? [], input.factId);

    if (existing?.userEdited) {
      const changed =
        sourceConversationIds.length !== existing.sourceConversationIds.length ||
        sourceFactIds.length !== existing.sourceFactIds.length;
      if (changed) await ref.set({ sourceConversationIds, sourceFactIds }, { merge: true });
      return {
        outcome: 'provenance_only',
        item: { ...existing, sourceConversationIds, sourceFactIds },
      };
    }

    const now = new Date().toISOString();
    const atIso = (input.at ?? new Date()).toISOString();
    const confidence = Math.min(1, Math.max(0, input.confidence));
    // An inferred mention never overwrites what the user said themselves.
    const keepText =
      existing &&
      (existing.confidence > confidence ||
        (existing.source !== 'inferred' && input.source === 'inferred'));
    const ownWords = input.source === 'explicit' || input.source === 'user';
    const amount = ownWords && input.amount ? input.amount : existing?.amount;
    const newConversation =
      !existing ||
      !input.conversationId ||
      !existing.sourceConversationIds.includes(input.conversationId);
    const item: FinanceItem = {
      ...(existing ?? {}),
      id,
      kind: input.kind,
      subject,
      text: keepText ? existing.text : text,
      status:
        input.status ?? existing?.status ?? (input.kind === 'purchase' ? 'planned' : 'active'),
      ...(amount ? { amount } : {}),
      ...((input.dueDay ?? existing?.dueDay) ? { dueDay: input.dueDay ?? existing?.dueDay } : {}),
      confidence: Math.max(existing?.confidence ?? 0, confidence),
      source: keepText ? existing.source : input.source,
      sourceConversationIds,
      sourceFactIds,
      mentions: (existing?.mentions ?? 0) + (newConversation ? 1 : 0),
      userEdited: false,
      firstMentionedAt: existing?.firstMentionedAt ?? atIso,
      lastMentionedAt:
        atIso > (existing?.lastMentionedAt ?? '') ? atIso : (existing?.lastMentionedAt ?? atIso),
      updatedAt: now,
    };
    await ref.set(toDoc(item), { merge: true });
    return { outcome: existing ? 'updated' : 'created', item };
  } catch (error) {
    log.warn({ userId, kind: input.kind, error: String(error) }, 'Finance upsert failed');
    return { outcome: 'failed' };
  }
}

/** Store link fields (goal / reminder) on an item. Never throws. */
export async function setFinanceLinks(
  userId: string,
  id: string,
  links: { aspirationId?: string; aspirationCreated?: boolean; dateId?: string | null }
): Promise<void> {
  const fs = getFirestoreDb();
  if (!fs) return;
  const patch: Record<string, unknown> = {};
  if (links.aspirationId) patch.aspirationId = links.aspirationId;
  if (links.aspirationCreated) patch.aspirationCreated = true;
  if (links.dateId) patch.dateId = links.dateId;
  if (Object.keys(patch).length === 0) return;
  try {
    await col(fs, userId).doc(id).set(patch, { merge: true });
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not link finance item');
  }
}

export async function listFinanceItems(userId: string): Promise<FinanceItem[]> {
  const fs = getFirestoreDb();
  if (!fs) return [];
  try {
    const snap = await col(fs, userId).get();
    return snap.docs
      .map((d) => parseFinanceDoc(d.id, d.data()))
      .filter((i): i is FinanceItem => i !== null)
      .sort((a, b) => b.lastMentionedAt.localeCompare(a.lastMentionedAt))
      .slice(0, MAX_ITEMS);
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not list finance items');
    return [];
  }
}

export async function getFinanceItem(userId: string, id: string): Promise<FinanceItem | null> {
  const fs = getFirestoreDb();
  if (!fs || !isFinanceId(id)) return null;
  const snap = await col(fs, userId).doc(id).get();
  return snap.exists ? parseFinanceDoc(id, snap.data()) : null;
}

export type FinanceEditError = 'not_found' | 'invalid' | 'unavailable';

function validEdit(edit: FinanceEdit): boolean {
  const keys = ['text', 'status', 'amount', 'dueDay'] as const;
  if (!keys.some((k) => edit[k] !== undefined)) return false;
  if (edit.status !== undefined && !isFinanceStatus(edit.status)) return false;
  if (edit.dueDay !== undefined && edit.dueDay !== null && !validDay(edit.dueDay)) return false;
  const a = edit.amount;
  if (a !== undefined && a !== null) {
    if (!(typeof a.value === 'number' && a.value > 0 && a.value <= 1e10)) return false;
    if (a.period !== undefined && !isPeriod(a.period)) return false;
    if (a.currency !== undefined && !isCurrency(a.currency)) return false;
  }
  return true;
}

/** The user corrects an item on the page (their word wins from now on). */
export async function editFinanceItem(
  userId: string,
  id: string,
  edit: FinanceEdit
): Promise<Result<FinanceItem, FinanceEditError>> {
  if (!isFinanceId(id)) return failure('not_found');
  if (!validEdit(edit)) return failure('invalid');
  let text: string | undefined;
  if (edit.text !== undefined) {
    const clean = cleanFinanceText(edit.text);
    if (!clean) return failure('invalid');
    text = clean;
  }
  const fs = getFirestoreDb();
  if (!fs) return failure('unavailable');
  try {
    const ref = col(fs, userId).doc(id);
    const snap = await ref.get();
    const existing = snap.exists ? parseFinanceDoc(id, snap.data()) : null;
    if (!existing) return failure('not_found');
    const now = new Date().toISOString();
    const { amount: _a, dueDay: _d, ...base } = existing;
    void _a;
    void _d;
    const amount =
      edit.amount === undefined
        ? existing.amount
        : edit.amount === null
          ? undefined
          : {
              value: Math.round(edit.amount.value * 100) / 100,
              currency: edit.amount.currency ?? existing.amount?.currency ?? 'USD',
              ...(edit.amount.period ? { period: edit.amount.period } : {}),
              said: '',
            };
    const dueDay =
      edit.dueDay === undefined ? existing.dueDay : edit.dueDay === null ? undefined : edit.dueDay;
    const item: FinanceItem = {
      ...base,
      ...(text ? { text } : {}),
      ...(edit.status ? { status: edit.status } : {}),
      ...(amount ? { amount } : {}),
      ...(dueDay ? { dueDay } : {}),
      userEdited: true,
      editedAt: now,
      updatedAt: now,
    };
    await ref.set(toDoc(item)); // full replace so cleared fields go away
    return success(item);
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Finance edit failed');
    return failure('unavailable');
  }
}

/** Delete one item and tombstone it so capture can't add it back. Returns the deleted item. */
export async function deleteFinanceItem(
  userId: string,
  id: string,
  reason: FinanceTombstoneReason
): Promise<FinanceItem | null> {
  if (!isFinanceId(id)) return null;
  const fs = getFirestoreDb();
  if (!fs) return null;
  try {
    const ref = col(fs, userId).doc(id);
    const snap = await ref.get();
    const existing = snap.exists ? parseFinanceDoc(id, snap.data()) : null;
    if (!existing) return null;
    await tombstone(fs, userId, id).set({
      createdAt: new Date().toISOString(),
      reason,
      kind: 'finance',
    });
    await ref.delete();
    return existing;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Finance delete failed');
    return null;
  }
}

/** Overwrite a provenance list on one item. */
export async function setFinanceProvenance(
  userId: string,
  id: string,
  field: 'sourceConversationIds' | 'sourceFactIds',
  ids: readonly string[]
): Promise<void> {
  const fs = getFirestoreDb();
  if (!fs) return;
  await col(fs, userId)
    .doc(id)
    .set({ [field]: [...ids] }, { merge: true });
}

/** Wipe every money item (delete-all, account erasure). Returns the deleted items. */
export async function deleteAllFinanceItems(userId: string): Promise<FinanceItem[]> {
  const fs = getFirestoreDb();
  if (!fs) return [];
  const snap = await col(fs, userId).get();
  const items: FinanceItem[] = [];
  for (const d of snap.docs) {
    const item = parseFinanceDoc(d.id, d.data());
    if (item) items.push(item);
    await d.ref.delete();
  }
  return items;
}

export async function countFinanceItems(userId: string): Promise<number> {
  const fs = getFirestoreDb();
  if (!fs) return 0;
  return (await col(fs, userId).get()).docs.length;
}
