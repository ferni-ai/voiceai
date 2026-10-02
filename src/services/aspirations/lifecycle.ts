/**
 * Cascade, wipe and export hooks for the memory-control service.
 *
 *   deleteAspirationsFor(userId, conversationId)  conversation deleted
 *   deleteAllAspirations(userId)                  "delete all my memory"
 *   exportAspirations(userId)                     memory export
 *
 * @module services/aspirations/lifecycle
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { success } from '../../types/result.js';
import { localToday } from '../important-dates/date-math.js';
import { resolveTimeZone } from '../important-dates/settings.js';
import { withStreaks } from './habit-math.js';
import { recordFromDoc, toDoc } from './record.js';
import {
  ASPIRATIONS_COLLECTION,
  listAspirations,
  runAfterDelete,
  storageError,
  tombstoneRef,
  unavailable,
  userRef,
  type StoreResult,
} from './store.js';
import type { AspirationRecord, CheckIn, Milestone } from './types.js';

const log = createLogger({ module: 'aspirations:lifecycle' });

/**
 * Drop a conversation from every item's provenance (and its check-ins).
 * Items left with no provenance that the user never edited are deleted and
 * tombstoned, so catch-up capture can't re-add them. Items the user created
 * on the page or migrated from older stores carry no provenance and stay.
 */
export async function deleteAspirationsFor(
  userId: string,
  conversationId: string
): StoreResult<{ updated: number; deleted: number }> {
  const db = getFirestoreDb();
  if (!db || !userId) return unavailable();
  try {
    const col = userRef(db, userId).collection(ASPIRATIONS_COLLECTION);
    const snap = await col.where('sourceConversationIds', 'array-contains', conversationId).get();
    let updated = 0;
    let deleted = 0;
    const touched = new Set<string>();
    for (const doc of snap.docs) {
      const record = recordFromDoc(doc.id, doc.data());
      if (!record) continue;
      touched.add(doc.id);
      const remaining = record.sourceConversationIds.filter((c) => c !== conversationId);
      if (remaining.length === 0 && !record.userEdited) {
        await tombstoneRef(db, userId, doc.id).set({
          createdAt: new Date().toISOString(),
          reason: 'user_deleted',
          kind: 'aspiration',
          conversationId,
        });
        await doc.ref.delete();
        await col
          .where('parentId', '==', doc.id)
          .get()
          .then(async (kids) =>
            Promise.all(kids.docs.map((k) => k.ref.update({ parentId: null })))
          );
        await runAfterDelete(userId, record);
        deleted++;
      } else {
        const next = await withoutConversationCheckIns(
          userId,
          { ...record, sourceConversationIds: remaining },
          conversationId
        );
        await doc.ref.set(toDoc(next));
        updated++;
      }
    }
    // Check-ins recorded in that conversation on items it didn't create.
    const habits = await col.where('level', '==', 'habit').get();
    for (const doc of habits.docs) {
      if (touched.has(doc.id)) continue;
      const record = recordFromDoc(doc.id, doc.data());
      if (!record?.habit?.checkIns.some((c) => c.conversationId === conversationId)) continue;
      await doc.ref.set(toDoc(await withoutConversationCheckIns(userId, record, conversationId)));
      updated++;
    }
    log.info({ userId, conversationId, updated, deleted }, 'Aspirations cascade');
    return success({ updated, deleted });
  } catch (error) {
    log.error({ error: String(error), userId, conversationId }, 'Aspirations cascade failed');
    return storageError(error);
  }
}

async function withoutConversationCheckIns(
  userId: string,
  record: AspirationRecord,
  conversationId: string
): Promise<AspirationRecord> {
  if (!record.habit?.checkIns.some((c) => c.conversationId === conversationId)) return record;
  const checkIns = record.habit.checkIns.filter((c) => c.conversationId !== conversationId);
  const today = localToday(new Date(), await resolveTimeZone(userId));
  // Streaks are recomputed from what's left; the old longest may have relied on removed days.
  const habit = withStreaks({ ...record.habit, checkIns, longestStreak: 0 }, today);
  return { ...record, habit, updatedAt: new Date().toISOString() };
}

/** Wipe every aspiration (the migration marker stays so old stores aren't re-copied). */
export async function deleteAllAspirations(userId: string): StoreResult<{ deleted: number }> {
  const db = getFirestoreDb();
  if (!db || !userId) return unavailable();
  try {
    const snap = await userRef(db, userId).collection(ASPIRATIONS_COLLECTION).get();
    for (const doc of snap.docs) {
      const record = recordFromDoc(doc.id, doc.data());
      await doc.ref.delete();
      if (record) await runAfterDelete(userId, record);
    }
    log.info({ userId, deleted: snap.size }, 'All aspirations deleted');
    return success({ deleted: snap.size });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Could not delete all aspirations');
    return storageError(error);
  }
}

export interface ExportedAspiration {
  id: string;
  level: string;
  title: string;
  why?: string;
  status: string;
  parentId: string | null;
  category?: string;
  targetDate?: string;
  progress?: number;
  milestones: Milestone[];
  notes: string[];
  habit?: {
    frequency: string;
    days?: number[];
    timesPerDay: number;
    reminderTime?: string;
    glidepathLevel?: number;
    cue?: string;
    routine?: string;
    reward?: string;
    stackAnchor?: string;
    streak: number;
    longestStreak: number;
    checkIns: CheckIn[];
  };
  source: string;
  confidence: number;
  userEdited: boolean;
  sourceConversationIds: string[];
  createdAt: string;
  updatedAt: string;
}

export function toExport(r: AspirationRecord): ExportedAspiration {
  const h = r.habit;
  return {
    id: r.id,
    level: r.level,
    title: r.title,
    ...(r.why ? { why: r.why } : {}),
    status: r.status,
    parentId: r.parentId,
    ...(r.category ? { category: r.category } : {}),
    ...(r.targetDate ? { targetDate: r.targetDate } : {}),
    ...(r.progress !== undefined ? { progress: r.progress } : {}),
    milestones: r.milestones,
    notes: r.notes,
    ...(h
      ? {
          habit: {
            frequency: h.schedule.frequency,
            ...(h.schedule.days ? { days: h.schedule.days } : {}),
            timesPerDay: h.schedule.timesPerDay,
            ...(h.schedule.reminderTime ? { reminderTime: h.schedule.reminderTime } : {}),
            ...(h.glidepathLevel ? { glidepathLevel: h.glidepathLevel } : {}),
            ...(h.loop?.cue ? { cue: h.loop.cue } : {}),
            ...(h.loop?.routine ? { routine: h.loop.routine } : {}),
            ...(h.loop?.reward ? { reward: h.loop.reward } : {}),
            ...(h.stackAnchor ? { stackAnchor: h.stackAnchor } : {}),
            streak: h.streak,
            longestStreak: h.longestStreak,
            checkIns: h.checkIns,
          },
        }
      : {}),
    source: r.source,
    confidence: r.confidence,
    userEdited: r.userEdited,
    sourceConversationIds: r.sourceConversationIds,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Everything in a portable shape for the memory export. */
export async function exportAspirations(userId: string): StoreResult<ExportedAspiration[]> {
  const listed = await listAspirations(userId);
  if (!listed.success) return listed;
  return success(listed.data.map(toExport));
}
