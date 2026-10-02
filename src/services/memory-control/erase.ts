/**
 * "Forget everything": wipe all of a user's memory but keep the account and
 * profile basics (name, preferences, subscription, settings).
 *
 * @module services/memory-control/erase
 */

import type { CollectionReference, DocumentData, Firestore } from '@google-cloud/firestore';
import { err, ok } from '../../memory/result.js';
import { createLogger } from '../../utils/safe-logger.js';
import { deleteQuery, getDb, MEMORY_COLLECTIONS, USERS, userCollection, userRef } from './db.js';
import { removeAllVectors, removeGraphRecords } from './derived-stores.js';
import { deleteAllDomains } from './domains.js';
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

/** Linked anonymous identities (identity merge) whose redirect points at this account. */
export async function mergedIdentities(db: Firestore, userId: string): Promise<string[]> {
  const links = await userRef(db, userId).collection('linked_identities').get();
  const out: string[] = [];
  for (const link of links.docs) {
    if (link.id === userId) continue;
    const snap = await db.collection(USERS).doc(link.id).get();
    if (snap.data()?.mergedInto === userId) out.push(link.id);
  }
  return out;
}

export async function deleteAllMemories(
  userId: string
): Promise<MemoryControlResult<MemoryDeletionReport>> {
  assertSafeUserId(userId);
  const db = getDb();
  if (!db) return err(unavailable);

  const collections: Record<string, number> = {};
  // Anonymous identities merged into this account may still hold memory (an
  // unfinished merge); they are wiped too. Only ones that redirect here.
  const owners = [userId, ...(await mergedIdentities(db, userId))];
  for (const owner of owners) {
    for (const name of MEMORY_COLLECTIONS) {
      const col = userCollection(db, owner, name);
      collections[name] =
        (collections[name] ?? 0) + (await deleteQuery(col, undefined, NESTED[name] ?? []));
      await sweepCollection(db, col);
    }
  }
  await resetProfileMemory(db, userId);

  let embeddings = 0;
  for (const owner of owners) embeddings += await removeAllVectors(owner);
  const graphRecords = await removeGraphRecords(userId, { all: true });
  const domains = await deleteAllDomains(userId);
  log.info({ collections, embeddings, graphRecords, domains }, 'All memories deleted by user');
  return ok({ collections, embeddings, graphRecords, domains });
}
