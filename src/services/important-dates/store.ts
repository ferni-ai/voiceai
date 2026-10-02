/**
 * Canonical important-dates store over `bogle_users/{uid}/important_dates/{id}`.
 *
 * - Ids are deterministic from `key` (identity.ts): re-learning a date upserts.
 * - The user's word wins: a detected upsert never changes a `source: 'user'`
 *   date's fields, it only adds provenance.
 * - Deleted dates leave a tombstone in `memory_tombstones/{id}` so detection
 *   can't bring them back; a user re-adding a date clears it.
 * - Dates are kept until the user deletes them.
 *
 * @module services/important-dates/store
 */

import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { failure, success, type Result } from '../../types/result.js';
import { importantDateIdFor } from './identity.js';
import { mergeRecord, newRecord, recordFromDoc, unionIds, validateInput } from './record.js';
import { scheduleFields, type ScheduleContext } from './reminder-schedule.js';
import { getReminderSettings, resolveTimeZone } from './settings.js';
import {
  ImportantDateError,
  type ImportantDateInput,
  type ImportantDateRecord,
  type UpsertOutcome,
} from './types.js';

const log = createLogger({ module: 'important-dates:store' });

export const DATES_COLLECTION = 'important_dates';
export const DELIVERIES_COLLECTION = 'important_date_deliveries';
export const TOMBSTONES_COLLECTION = 'memory_tombstones';

export type TombstoneReason = 'user_deleted' | 'voice_forget';

type StoreResult<T> = Promise<Result<T, ImportantDateError>>;

const unavailable = () =>
  failure(new ImportantDateError('storage_unavailable', 'Firestore not available'));

export function userRef(db: Firestore, userId: string) {
  return db.collection('bogle_users').doc(userId);
}

export function dateRef(db: Firestore, userId: string, id: string): DocumentReference {
  return userRef(db, userId).collection(DATES_COLLECTION).doc(id);
}

function tombstoneRef(db: Firestore, userId: string, id: string): DocumentReference {
  return userRef(db, userId).collection(TOMBSTONES_COLLECTION).doc(id);
}

/** The context reminders are planned in (user's time zone, settings, now). */
export async function scheduleContextFor(
  userId: string,
  now = new Date()
): Promise<ScheduleContext> {
  const settings = await getReminderSettings(userId);
  return { timeZone: await resolveTimeZone(userId, settings), now, settings };
}

/** Fill in nextReminderAt/nextReminderKey for a record. */
export function withSchedule(
  record: ImportantDateRecord,
  ctx: ScheduleContext
): ImportantDateRecord {
  return { ...record, ...scheduleFields(record, ctx) };
}

/** Firestore rejects undefined values; records never carry them, but be safe. */
function toDoc(record: ImportantDateRecord): Record<string, unknown> {
  return JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
}

export async function upsertImportantDate(
  userId: string,
  input: ImportantDateInput
): StoreResult<UpsertOutcome> {
  const invalid = validateInput(input);
  if (invalid) return failure(new ImportantDateError('invalid_input', invalid));
  const db = getFirestoreDb();
  if (!db) return unavailable();

  const id = importantDateIdFor(input.key);
  const ctx = await scheduleContextFor(userId);
  const now = ctx.now.toISOString();
  try {
    const outcome = await db.runTransaction(async (tx): Promise<UpsertOutcome> => {
      const ref = dateRef(db, userId, id);
      const tomb = tombstoneRef(db, userId, id);
      const [snap, tombSnap] = [await tx.get(ref), await tx.get(tomb)];

      if (tombSnap.exists) {
        if (input.source === 'detected') return { id, status: 'skipped_tombstoned' };
        tx.delete(tomb); // The user is deliberately adding it back.
      }

      const existing = snap.exists ? recordFromDoc(id, snap.data() ?? {}) : null;
      if (existing && existing.source === 'user' && input.source === 'detected') {
        const ids = unionIds(existing.sourceConversationIds, input.sourceConversationIds);
        if (ids.length !== existing.sourceConversationIds.length) {
          tx.update(ref, { sourceConversationIds: ids });
        }
        return {
          id,
          status: 'provenance_merged',
          record: { ...existing, sourceConversationIds: ids },
        };
      }

      const base = existing ? mergeRecord(existing, input, now) : newRecord(id, input, now);
      const record = withSchedule(base, ctx);
      tx.set(ref, toDoc(record));
      return { id, status: existing ? 'updated' : 'created', record };
    });
    log.info({ userId, id, status: outcome.status, source: input.source }, 'Important date upsert');
    return success(outcome);
  } catch (error) {
    log.error({ error: String(error), userId, id }, 'Important date upsert failed');
    return failure(new ImportantDateError('storage_unavailable', String(error)));
  }
}

export async function listImportantDates(userId: string): StoreResult<ImportantDateRecord[]> {
  const db = getFirestoreDb();
  if (!db) return unavailable();
  try {
    const { migrateLegacyDates } = await import('./legacy-migration.js');
    await migrateLegacyDates(userId);
    const snap = await userRef(db, userId).collection(DATES_COLLECTION).get();
    const records = snap.docs
      .map((d) => recordFromDoc(d.id, d.data()))
      .filter((r): r is ImportantDateRecord => r !== null)
      .sort((a, b) => a.title.localeCompare(b.title));
    return success(records);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Could not list important dates');
    return failure(new ImportantDateError('storage_unavailable', String(error)));
  }
}

export async function getImportantDate(
  userId: string,
  id: string
): StoreResult<ImportantDateRecord> {
  const db = getFirestoreDb();
  if (!db) return unavailable();
  try {
    const snap = await dateRef(db, userId, id).get();
    const record = snap.exists ? recordFromDoc(id, snap.data() ?? {}) : null;
    return record ? success(record) : failure(new ImportantDateError('not_found', 'No such date'));
  } catch (error) {
    return failure(new ImportantDateError('storage_unavailable', String(error)));
  }
}

/** Write a full record (used by edits and the reminder job). */
export async function saveImportantDate(
  userId: string,
  record: ImportantDateRecord
): StoreResult<ImportantDateRecord> {
  const db = getFirestoreDb();
  if (!db) return unavailable();
  try {
    await dateRef(db, userId, record.id).set(toDoc(record));
    return success(record);
  } catch (error) {
    log.error({ error: String(error), userId, id: record.id }, 'Could not save important date');
    return failure(new ImportantDateError('storage_unavailable', String(error)));
  }
}

async function deleteDeliveriesFor(db: Firestore, userId: string, dateId: string): Promise<void> {
  const snap = await userRef(db, userId)
    .collection(DELIVERIES_COLLECTION)
    .where('dateId', '==', dateId)
    .get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

/** Delete a date and tombstone it so detection won't re-add it. */
export async function deleteImportantDate(
  userId: string,
  id: string,
  reason: TombstoneReason = 'user_deleted'
): StoreResult<{ deleted: boolean }> {
  const db = getFirestoreDb();
  if (!db) return unavailable();
  try {
    const ref = dateRef(db, userId, id);
    const snap = await ref.get();
    if (!snap.exists) return failure(new ImportantDateError('not_found', 'No such date'));
    await tombstoneRef(db, userId, id).set({
      createdAt: new Date().toISOString(),
      reason,
      kind: 'important_date',
    });
    await ref.delete();
    await deleteDeliveriesFor(db, userId, id);
    log.info({ userId, id, reason }, 'Important date deleted');
    return success({ deleted: true });
  } catch (error) {
    log.error({ error: String(error), userId, id }, 'Could not delete important date');
    return failure(new ImportantDateError('storage_unavailable', String(error)));
  }
}

/**
 * Cascade hook for conversation deletion: drop the conversation from every
 * date's provenance; delete (and tombstone) detected dates left with none.
 * User-created dates are kept.
 */
export async function deleteImportantDatesFor(
  userId: string,
  conversationId: string
): StoreResult<{ updated: number; deleted: number }> {
  const db = getFirestoreDb();
  if (!db) return unavailable();
  try {
    const snap = await userRef(db, userId)
      .collection(DATES_COLLECTION)
      .where('sourceConversationIds', 'array-contains', conversationId)
      .get();
    let updated = 0;
    let deleted = 0;
    for (const doc of snap.docs) {
      const record = recordFromDoc(doc.id, doc.data());
      if (!record) continue;
      const remaining = record.sourceConversationIds.filter((c) => c !== conversationId);
      if (remaining.length === 0 && record.source === 'detected') {
        await tombstoneRef(db, userId, doc.id).set({
          createdAt: new Date().toISOString(),
          reason: 'user_deleted',
          kind: 'important_date',
          conversationId,
        });
        await doc.ref.delete();
        await deleteDeliveriesFor(db, userId, doc.id);
        deleted++;
      } else {
        await doc.ref.update({ sourceConversationIds: remaining });
        updated++;
      }
    }
    log.info({ userId, conversationId, updated, deleted }, 'Important dates cascade');
    return success({ updated, deleted });
  } catch (error) {
    log.error({ error: String(error), userId, conversationId }, 'Important dates cascade failed');
    return failure(new ImportantDateError('storage_unavailable', String(error)));
  }
}

/** Wipe every date and delivery record (part of "delete all my memory"). */
export async function deleteAllImportantDates(userId: string): StoreResult<{ deleted: number }> {
  const db = getFirestoreDb();
  if (!db) return unavailable();
  try {
    const user = userRef(db, userId);
    const [dates, deliveries] = await Promise.all([
      user.collection(DATES_COLLECTION).get(),
      user.collection(DELIVERIES_COLLECTION).get(),
    ]);
    await Promise.all([...dates.docs, ...deliveries.docs].map((d) => d.ref.delete()));
    log.info({ userId, deleted: dates.size }, 'All important dates deleted');
    return success({ deleted: dates.size });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Could not delete all important dates');
    return failure(new ImportantDateError('storage_unavailable', String(error)));
  }
}

export interface ExportedImportantDate {
  id: string;
  title: string;
  date: string;
  recurring: boolean;
  kind: string;
  source: string;
  personId?: string;
  reminders: { enabled: boolean; offsets: number[] };
  channels?: string[];
  sourceConversationIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Dates in a portable shape for the memory export. */
export async function exportImportantDates(userId: string): StoreResult<ExportedImportantDate[]> {
  const listed = await listImportantDates(userId);
  if (!listed.success) return listed;
  return success(
    listed.data.map((r) => ({
      id: r.id,
      title: r.title,
      date: r.date,
      recurring: r.recurring,
      kind: r.kind,
      source: r.source,
      ...(r.personId ? { personId: r.personId } : {}),
      reminders: { enabled: r.reminders.enabled, offsets: r.reminders.offsets },
      ...(r.channels ? { channels: r.channels } : {}),
      sourceConversationIds: r.sourceConversationIds,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))
  );
}
