/**
 * "Forget everything": wipe all of a user's memory but keep the account and
 * profile basics (name, preferences, subscription, settings).
 *
 * @module services/memory-control/erase
 */

import type { CollectionReference, DocumentData, Firestore } from '@google-cloud/firestore';
import { err, ok } from '../../memory/result.js';
import { createLogger } from '../../utils/safe-logger.js';
import { deleteQuery, getDb, MEMORY_COLLECTIONS, userCollection, userRef } from './db.js';
import { removeAllVectors, removeGraphRecords } from './derived-stores.js';
import { unavailable } from './facts.js';
import type { MemoryControlResult, MemoryDeletionReport } from './types.js';

const log = createLogger({ module: 'MemoryControlErase' });

/** Known nested subcollections, deleted (and counted) with their parents. */
const NESTED: Record<string, readonly string[]> = {
  conversations: ['turns'],
  conversation_threads: ['messages'],
};

/** Profile fields that hold remembered content; reset by deleteAllMemories. */
const PROFILE_MEMORY_LISTS = [
  'conversationSummaries',
  'keyMoments',
  'familyMembers',
  'emotionalPatterns',
  'sharedStories',
  'lifeEvents',
  'openQuestions',
  'pendingFollowUps',
  'primaryConcerns',
  'extractedDetails',
] as const;
const PROFILE_MEMORY_FIELDS = ['lastConversationSummary', 'personaMemories'] as const;

/** Reject IDs that could address something other than one user's document. */
export function assertSafeUserId(userId: string): void {
  if (!userId || userId.includes('/') || userId.trim() !== userId || userId.length > 256) {
    throw new Error('Refusing to delete data for an invalid user id');
  }
}

/**
 * Remove leftovers the counted pass can't see (subcollections under
 * documents that no longer exist). Uses Firestore's recursiveDelete when present.
 */
export async function sweepCollection(
  db: Firestore,
  collection: CollectionReference
): Promise<void> {
  const recursive = (db as { recursiveDelete?: (ref: CollectionReference) => Promise<void> })
    .recursiveDelete;
  if (typeof recursive === 'function') await recursive.call(db, collection);
}

async function resetProfileMemory(db: Firestore, userId: string): Promise<boolean> {
  const ref = userRef(db, userId);
  const snap = await ref.get();
  const data = snap.data();
  if (!snap.exists || !data) return false;
  const updated: DocumentData = { ...data };
  for (const field of PROFILE_MEMORY_LISTS) if (field in updated) updated[field] = [];
  for (const field of PROFILE_MEMORY_FIELDS) delete updated[field];
  updated.memoryResetAt = new Date();
  await ref.set(updated);
  return true;
}

export async function deleteAllMemories(
  userId: string
): Promise<MemoryControlResult<MemoryDeletionReport>> {
  assertSafeUserId(userId);
  const db = getDb();
  if (!db) return err(unavailable);

  const collections: Record<string, number> = {};
  for (const name of MEMORY_COLLECTIONS) {
    const col = userCollection(db, userId, name);
    collections[name] = await deleteQuery(col, undefined, NESTED[name] ?? []);
    await sweepCollection(db, col);
  }
  await resetProfileMemory(db, userId);

  const embeddings = await removeAllVectors(userId);
  const graphRecords = await removeGraphRecords(userId, { all: true });
  log.info({ collections, embeddings, graphRecords }, 'All memories deleted by user');
  return ok({ collections, embeddings, graphRecords });
}
