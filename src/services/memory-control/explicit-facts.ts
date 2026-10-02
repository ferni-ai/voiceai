/**
 * Explicit facts — things the user asked Ferni to remember ("remember that
 * my sister is Ana"), stored by the rememberAboutUser tool in
 * `bogle_users/{uid}/extracted_facts` (field `fact`).
 *
 * They are listed alongside extracted facts with an `explicit_` ID prefix so
 * the same edit/delete routes work for both. Because the user stated them on
 * purpose, deleting a conversation does not remove them (like userEdited facts).
 *
 * @module services/memory-control/explicit-facts
 */

import type { DocumentData } from '@google-cloud/firestore';
import { getFirestoreVectorStore } from '../../memory/firestore-vector-store.js';
import type { VectorDocument } from '../../memory/vectors/vector-store-interface.js';
import { createLogger } from '../../utils/safe-logger.js';
import { asString, getDb, removeDoc, toIso, userCollection, type UndoJournal } from './db.js';
import { removeVectors } from './derived-stores.js';
import type { Fact } from './types.js';

const log = createLogger({ module: 'MemoryControlExplicitFacts' });

export const EXPLICIT_PREFIX = 'explicit_';
export const EXPLICIT_COLLECTION = 'extracted_facts';
const MAX_EXPLICIT = 1000;

export function isExplicitId(id: string): boolean {
  return id.startsWith(EXPLICIT_PREFIX);
}

export function explicitDocId(id: string): string {
  return id.slice(EXPLICIT_PREFIX.length);
}

export function toExplicitFact(docId: string, data: DocumentData): Fact {
  const session = asString(data.sessionId);
  return {
    id: `${EXPLICIT_PREFIX}${docId}`,
    text: asString(data.text) ?? asString(data.fact) ?? asString(data.content) ?? '',
    category: asString(data.category) ?? 'personal',
    confidence:
      typeof data.confidence === 'number' ? Math.max(0, Math.min(1, data.confidence)) : 0.9,
    sourceConversationIds: session ? [session] : [],
    // Stated by the user on purpose: treated like a user-edited fact.
    userEdited: true,
    updatedAt: toIso(data.updatedAt ?? data.editedAt ?? data.extractedAt ?? data.createdAt),
  };
}

export async function listExplicitFacts(userId: string): Promise<Fact[]> {
  const db = getDb();
  if (!db) return [];
  const snap = await userCollection(db, userId, EXPLICIT_COLLECTION).limit(MAX_EXPLICIT).get();
  return snap.docs.map((d) => toExplicitFact(d.id, d.data())).filter((f) => f.text !== '');
}

/**
 * Vector entries written by rememberAboutUser carry a timestamp ID, so they
 * are found by user + source + identical text.
 */
async function explicitVectors(userId: string, text: string): Promise<VectorDocument[]> {
  try {
    const docs = await getFirestoreVectorStore().list({ userId, source: 'user_memory' });
    return docs.filter((d) => d.text === text);
  } catch (error) {
    log.warn({ error: String(error) }, 'Could not look up explicit-fact vectors');
    return [];
  }
}

async function explicitVectorIds(userId: string, text: string): Promise<string[]> {
  return (await explicitVectors(userId, text)).map((d) => d.id);
}

/** Returns false when the doc doesn't exist. */
export async function deleteExplicitFact(
  userId: string,
  id: string,
  journal?: UndoJournal
): Promise<boolean> {
  const db = getDb();
  if (!db) throw new Error('Firestore unavailable');
  const ref = userCollection(db, userId, EXPLICIT_COLLECTION).doc(explicitDocId(id));
  const snap = await ref.get();
  const data = snap.data();
  if (!snap.exists || !data) return false;
  const text = toExplicitFact(ref.id, data).text;
  await removeDoc(ref, journal, data);
  await removeVectors(userId, await explicitVectorIds(userId, text), journal);
  return true;
}

/** Returns the updated fact, or null when the doc doesn't exist. */
export async function editExplicitFact(
  userId: string,
  id: string,
  input: { text: string; category?: string }
): Promise<Fact | null> {
  const db = getDb();
  if (!db) throw new Error('Firestore unavailable');
  const ref = userCollection(db, userId, EXPLICIT_COLLECTION).doc(explicitDocId(id));
  const snap = await ref.get();
  const before = snap.data();
  if (!snap.exists || !before) return null;
  const oldText = toExplicitFact(ref.id, before).text;
  const now = new Date();
  const updated: DocumentData = {
    ...before,
    fact: input.text,
    text: input.text,
    ...(input.category ? { category: input.category } : {}),
    userEdited: true,
    editedAt: now,
    updatedAt: now,
  };
  delete updated.embedding; // stale for the new text
  await ref.set(updated);
  // Old text must not stay searchable: replace its vector with the new text.
  const stale = await explicitVectors(userId, oldText);
  await removeVectors(
    userId,
    stale.map((d) => d.id)
  );
  if (stale[0]) {
    try {
      await getFirestoreVectorStore().addDocument({
        id: stale[0].id,
        text: input.text,
        metadata: stale[0].metadata,
      });
    } catch (error) {
      log.warn({ error: String(error) }, 'Could not re-index edited explicit fact');
    }
  }
  return toExplicitFact(ref.id, updated);
}
