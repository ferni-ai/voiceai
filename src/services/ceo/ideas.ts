/**
 * Ideas Service - Idea Capture and Management
 *
 * Capture, tag, and retrieve ideas for inspiration and reference.
 * Stored in Firestore under users/{userId}/ideas/{ideaId}
 *
 * @module services/ceo/ideas
 */

import { Timestamp } from '@google-cloud/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import {
  getFirestoreDb,
  cleanForFirestore,
  recordDegradation,
  toSafeDate,
} from '../../utils/firestore-utils.js';
import { generateId } from '../../utils/id-generator.js';

const log = createLogger({ module: 'ceo-ideas' });

// ============================================================================
// TYPES
// ============================================================================

export interface Idea {
  id: string;
  userId: string;
  content: string;
  tags: string[];
  archived: boolean;
  createdAt: Date;
}

interface FirestoreIdea {
  id: string;
  userId: string;
  content: string;
  tags: string[];
  archived: boolean;
  createdAt: Timestamp;
}

// ============================================================================
// COLLECTION PATHS
// ============================================================================

const IDEAS_COLLECTION = 'ideas';

function getIdeasPath(userId: string): string {
  return `users/${userId}/${IDEAS_COLLECTION}`;
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Add a new idea with optional tags.
 */
export async function addIdea(
  userId: string,
  content: string,
  tags: string[] = []
): Promise<Idea> {
  const db = getFirestoreDb();

  const idea: Idea = {
    id: generateId('idea'),
    userId,
    content,
    tags,
    archived: false,
    createdAt: new Date(),
  };

  if (!db) {
    recordDegradation('ceo-ideas', 'addIdea');
    log.warn({ userId }, 'Firestore unavailable, idea not persisted');
    return idea;
  }

  try {
    const firestoreIdea: FirestoreIdea = {
      ...idea,
      createdAt: Timestamp.fromDate(idea.createdAt),
    };

    const docRef = db.collection(getIdeasPath(userId)).doc(idea.id);
    await docRef.set(cleanForFirestore(firestoreIdea));

    log.info({ userId, ideaId: idea.id, tags }, 'Idea added');
    return idea;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to add idea');
    return idea;
  }
}

/**
 * Get recent ideas (excluding archived by default).
 */
export async function getIdeas(userId: string, limit = 50): Promise<Idea[]> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-ideas', 'getIdeas');
    return [];
  }

  try {
    const ideasRef = db.collection(getIdeasPath(userId));
    const query = ideasRef
      .where('archived', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(limit);

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => firestoreToIdea(doc.data() as FirestoreIdea));
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get ideas');
    return [];
  }
}

/**
 * Get ideas by a specific tag.
 */
export async function getIdeasByTag(userId: string, tag: string): Promise<Idea[]> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-ideas', 'getIdeasByTag');
    return [];
  }

  try {
    const ideasRef = db.collection(getIdeasPath(userId));
    const query = ideasRef
      .where('tags', 'array-contains', tag)
      .where('archived', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(50);

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => firestoreToIdea(doc.data() as FirestoreIdea));
  } catch (error) {
    log.error({ error: String(error), userId, tag }, 'Failed to get ideas by tag');
    return [];
  }
}

/**
 * Get a random idea for inspiration.
 */
export async function getRandomIdea(userId: string): Promise<Idea | null> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-ideas', 'getRandomIdea');
    return null;
  }

  try {
    const ideasRef = db.collection(getIdeasPath(userId));
    const query = ideasRef.where('archived', '==', false).limit(100);
    const snapshot = await query.get();

    if (snapshot.empty) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * snapshot.docs.length);
    const randomDoc = snapshot.docs[randomIndex];

    return firestoreToIdea(randomDoc.data() as FirestoreIdea);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get random idea');
    return null;
  }
}

/**
 * Search ideas by content.
 */
export async function searchIdeas(userId: string, query: string): Promise<Idea[]> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-ideas', 'searchIdeas');
    return [];
  }

  try {
    // Firestore doesn't support full-text search, so we fetch and filter client-side
    const ideasRef = db.collection(getIdeasPath(userId));
    const snapshot = await ideasRef
      .where('archived', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();

    const lowerQuery = query.toLowerCase();

    return snapshot.docs
      .map((doc) => firestoreToIdea(doc.data() as FirestoreIdea))
      .filter((idea) => idea.content.toLowerCase().includes(lowerQuery));
  } catch (error) {
    log.error({ error: String(error), userId, query }, 'Failed to search ideas');
    return [];
  }
}

/**
 * Add tags to an existing idea.
 */
export async function tagIdea(
  userId: string,
  ideaId: string,
  tags: string[]
): Promise<Idea | null> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-ideas', 'tagIdea');
    return null;
  }

  try {
    const docRef = db.collection(getIdeasPath(userId)).doc(ideaId);
    const doc = await docRef.get();

    if (!doc.exists) {
      log.warn({ userId, ideaId }, 'Idea not found for tagging');
      return null;
    }

    const existingData = doc.data() as FirestoreIdea;
    const existingTags = existingData.tags || [];
    const newTags = [...new Set([...existingTags, ...tags])];

    await docRef.update({ tags: newTags });

    log.info({ userId, ideaId, tags: newTags }, 'Idea tags updated');

    return firestoreToIdea({
      ...existingData,
      tags: newTags,
    });
  } catch (error) {
    log.error({ error: String(error), userId, ideaId }, 'Failed to tag idea');
    return null;
  }
}

/**
 * Archive an idea (soft delete).
 */
export async function archiveIdea(userId: string, ideaId: string): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-ideas', 'archiveIdea');
    return false;
  }

  try {
    const docRef = db.collection(getIdeasPath(userId)).doc(ideaId);
    const doc = await docRef.get();

    if (!doc.exists) {
      log.warn({ userId, ideaId }, 'Idea not found for archiving');
      return false;
    }

    await docRef.update({ archived: true });

    log.info({ userId, ideaId }, 'Idea archived');
    return true;
  } catch (error) {
    log.error({ error: String(error), userId, ideaId }, 'Failed to archive idea');
    return false;
  }
}

/**
 * Get the total count of non-archived ideas.
 */
export async function getIdeaCount(userId: string): Promise<number> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-ideas', 'getIdeaCount');
    return 0;
  }

  try {
    const ideasRef = db.collection(getIdeasPath(userId));
    const snapshot = await ideasRef.where('archived', '==', false).count().get();
    return snapshot.data().count;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get idea count');
    return 0;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function firestoreToIdea(data: FirestoreIdea): Idea {
  return {
    id: data.id,
    userId: data.userId,
    content: data.content,
    tags: data.tags || [],
    archived: data.archived ?? false,
    createdAt: toSafeDate(data.createdAt),
  };
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const ideasService = {
  addIdea,
  getIdeas,
  getIdeasByTag,
  getRandomIdea,
  searchIdeas,
  tagIdea,
  archiveIdea,
  getIdeaCount,
};
