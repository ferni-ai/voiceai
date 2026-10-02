/**
 * Canonical aspirations store over `bogle_users/{uid}/aspirations/{id}`.
 *
 * - Ids are deterministic from level + title (identity.ts): re-learning upserts.
 * - The user's word wins: an upsert never changes a `userEdited` record's
 *   fields, it only adds provenance.
 * - Deleted items leave a tombstone in `memory_tombstones/{id}`; inferred
 *   capture skips them, an explicit re-add (the user saying it again, or
 *   adding it on the web page) clears it.
 * - Items are kept until the user deletes them.
 *
 * @module services/aspirations/store
 */

import type { DocumentReference, Firestore, Query } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { failure, success, type Result } from '../../types/result.js';
import { aspirationIdFor } from './identity.js';
import {
  mergeRecord,
  newRecord,
  recordFromDoc,
  toDoc,
  unionIds,
  validLevelLink,
  validateInput,
} from './record.js';
import {
  AspirationError,
  type AspirationInput,
  type AspirationLevel,
  type AspirationRecord,
  type UpsertOutcome,
} from './types.js';

const log = createLogger({ module: 'aspirations:store' });

export const ASPIRATIONS_COLLECTION = 'aspirations';
export const META_COLLECTION = 'aspirations_meta';
export const TOMBSTONES_COLLECTION = 'memory_tombstones';

export type TombstoneReason = 'user_deleted' | 'voice_forget';
export type StoreResult<T> = Promise<Result<T, AspirationError>>;

export const unavailable = () =>
  failure(new AspirationError('storage_unavailable', 'Firestore not available'));
export const storageError = (error: unknown) =>
  failure(new AspirationError('storage_unavailable', String(error)));
export const notFound = () => failure(new AspirationError('not_found', 'No such item'));

export function userRef(db: Firestore, userId: string) {
  return db.collection('bogle_users').doc(userId);
}

export function aspirationRef(db: Firestore, userId: string, id: string): DocumentReference {
  return userRef(db, userId).collection(ASPIRATIONS_COLLECTION).doc(id);
}

export function tombstoneRef(db: Firestore, userId: string, id: string): DocumentReference {
  return userRef(db, userId).collection(TOMBSTONES_COLLECTION).doc(id);
}

/** Post-write hooks (deadline sync, nudge planning) registered by other modules. */
type AfterWrite = (userId: string, record: AspirationRecord) => Promise<void>;
const afterWriteHooks: AfterWrite[] = [];
export function onAspirationWritten(hook: AfterWrite): void {
  afterWriteHooks.push(hook);
}

let hooksLoaded: Promise<unknown> | null = null;
/** The integration hooks (deadlines, nudges) register themselves on import. */
async function ensureHooks(): Promise<void> {
  hooksLoaded ??= import('./integrations.js').catch((error: unknown) => {
    log.warn({ error: String(error) }, 'Aspiration integrations unavailable');
  });
  await hooksLoaded;
}

async function runAfterWrite(userId: string, record: AspirationRecord): Promise<void> {
  await ensureHooks();
  for (const hook of afterWriteHooks) {
    try {
      await hook(userId, record);
    } catch (error) {
      log.warn(
        { error: String(error), userId, id: record.id },
        'Aspiration after-write hook failed'
      );
    }
  }
}

export async function upsertAspiration(
  userId: string,
  input: AspirationInput
): StoreResult<UpsertOutcome> {
  const invalid = validateInput(input);
  if (invalid) return failure(new AspirationError('invalid_input', invalid));
  const db = getFirestoreDb();
  if (!db || !userId) return unavailable();

  const id = aspirationIdFor(input.level, input.title);
  if (input.parentId === id)
    return failure(new AspirationError('invalid_input', 'cannot link to itself'));
  const now = new Date().toISOString();
  try {
    const outcome = await db.runTransaction(async (tx): Promise<UpsertOutcome | string> => {
      const ref = aspirationRef(db, userId, id);
      const tomb = tombstoneRef(db, userId, id);
      const snap = await tx.get(ref);
      const tombSnap = await tx.get(tomb);
      if (input.parentId) {
        const parent = await tx.get(aspirationRef(db, userId, input.parentId));
        const p = parent.exists ? recordFromDoc(parent.id, parent.data() ?? {}) : null;
        if (!p) return 'parent not found';
        if (!validLevelLink(input.level, p.level))
          return `a ${input.level} can't sit under a ${p.level}`;
      }

      if (tombSnap.exists) {
        if (input.source === 'inferred') return { id, status: 'skipped_tombstoned' };
        tx.delete(tomb); // The user is deliberately adding it back.
      }

      const existing = snap.exists ? recordFromDoc(id, snap.data() ?? {}) : null;
      if (existing?.userEdited) {
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
      const record = existing ? mergeRecord(existing, input, now) : newRecord(id, input, now);
      tx.set(ref, toDoc(record));
      return { id, status: existing ? 'updated' : 'created', record };
    });
    if (typeof outcome === 'string') return failure(new AspirationError('invalid_input', outcome));
    if (outcome.record && outcome.status !== 'provenance_merged') {
      await runAfterWrite(userId, outcome.record);
    }
    log.info(
      { userId, id, status: outcome.status, level: input.level, source: input.source },
      'Aspiration upsert'
    );
    return success(outcome);
  } catch (error) {
    log.error({ error: String(error), userId, id }, 'Aspiration upsert failed');
    return storageError(error);
  }
}

/** Every record (migrating legacy stores in first, once). */
export async function listAspirations(
  userId: string,
  filter: { level?: AspirationLevel } = {}
): StoreResult<AspirationRecord[]> {
  const db = getFirestoreDb();
  if (!db || !userId) return unavailable();
  try {
    const { migrateLegacyAspirations } = await import('./legacy-migration.js');
    await migrateLegacyAspirations(userId);
    let query = userRef(db, userId).collection(ASPIRATIONS_COLLECTION) as Query;
    if (filter.level) query = query.where('level', '==', filter.level);
    const snap = await query.get();
    const records = snap.docs
      .map((d) => recordFromDoc(d.id, d.data()))
      .filter((r): r is AspirationRecord => r !== null)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    return success(records);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Could not list aspirations');
    return storageError(error);
  }
}

export async function getAspiration(userId: string, id: string): StoreResult<AspirationRecord> {
  const db = getFirestoreDb();
  if (!db || !userId) return unavailable();
  try {
    const snap = await aspirationRef(db, userId, id).get();
    const record = snap.exists ? recordFromDoc(id, snap.data() ?? {}) : null;
    return record ? success(record) : notFound();
  } catch (error) {
    return storageError(error);
  }
}

/** Find the record that used to have `legacyId` in an older store. */
export async function findByLegacyId(
  userId: string,
  legacyId: string
): Promise<AspirationRecord | null> {
  const db = getFirestoreDb();
  if (!db || !userId || !legacyId) return null;
  try {
    const snap = await userRef(db, userId)
      .collection(ASPIRATIONS_COLLECTION)
      .where('legacyIds', 'array-contains', legacyId)
      .limit(1)
      .get();
    const doc = snap.docs[0];
    return doc ? recordFromDoc(doc.id, doc.data()) : null;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Legacy id lookup failed');
    return null;
  }
}

/** Write a full record (edits, check-ins). */
export async function saveAspiration(
  userId: string,
  record: AspirationRecord,
  opts: { skipHooks?: boolean } = {}
): StoreResult<AspirationRecord> {
  const db = getFirestoreDb();
  if (!db || !userId) return unavailable();
  try {
    await aspirationRef(db, userId, record.id).set(toDoc(record));
    if (!opts.skipHooks) await runAfterWrite(userId, record);
    return success(record);
  } catch (error) {
    log.error({ error: String(error), userId, id: record.id }, 'Could not save aspiration');
    return storageError(error);
  }
}

/** Children lose their link when a parent goes (they're kept). */
async function unlinkChildren(db: Firestore, userId: string, parentId: string): Promise<number> {
  const snap = await userRef(db, userId)
    .collection(ASPIRATIONS_COLLECTION)
    .where('parentId', '==', parentId)
    .get();
  await Promise.all(snap.docs.map((d) => d.ref.update({ parentId: null })));
  return snap.size;
}

/** Delete hooks (deadline removal) registered by other modules. */
type AfterDelete = (userId: string, record: AspirationRecord) => Promise<void>;
const afterDeleteHooks: AfterDelete[] = [];
export function onAspirationDeleted(hook: AfterDelete): void {
  afterDeleteHooks.push(hook);
}

export async function runAfterDelete(userId: string, record: AspirationRecord): Promise<void> {
  await ensureHooks();
  for (const hook of afterDeleteHooks) {
    try {
      await hook(userId, record);
    } catch (error) {
      log.warn({ error: String(error), userId, id: record.id }, 'Aspiration delete hook failed');
    }
  }
}

/** Delete an item and tombstone it so capture won't re-add it. */
export async function deleteAspiration(
  userId: string,
  id: string,
  reason: TombstoneReason = 'user_deleted'
): StoreResult<{ deleted: true; unlinked: number }> {
  const db = getFirestoreDb();
  if (!db || !userId) return unavailable();
  try {
    const ref = aspirationRef(db, userId, id);
    const snap = await ref.get();
    const record = snap.exists ? recordFromDoc(id, snap.data() ?? {}) : null;
    if (!record) return notFound();
    await tombstoneRef(db, userId, id).set({
      createdAt: new Date().toISOString(),
      reason,
      kind: 'aspiration',
    });
    await ref.delete();
    const unlinked = await unlinkChildren(db, userId, id);
    await runAfterDelete(userId, record);
    log.info({ userId, id, reason, unlinked }, 'Aspiration deleted');
    return success({ deleted: true, unlinked });
  } catch (error) {
    log.error({ error: String(error), userId, id }, 'Could not delete aspiration');
    return storageError(error);
  }
}
