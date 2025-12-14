/**
 * Relationship Memory
 *
 * Tracks what each persona has shared with each user, and what users have
 * shared with personas. This creates the feeling of a real relationship
 * that deepens over time.
 *
 * Persistence: Uses Firestore for long-term storage, with in-memory cache.
 *
 * @module personality/relationship-memory
 *
 * @deprecated MIGRATION GUIDE (2024-12):
 * This module duplicates functionality now available in the memory module.
 * For new code, prefer:
 *
 * 1. **Relationship tracking**: Use `personas/relationship-memory/` engine
 *    ```typescript
 *    import { getRelationshipEngine } from '../personas/relationship-memory/index.js';
 *    const engine = getRelationshipEngine(userId, personaId);
 *    ```
 *
 * 2. **Shared moment storage**: Use `memory/user-memory-indexer.ts`
 *    with the 'shared_story' category for semantic retrieval.
 *
 * 3. **Stage progression**: Use `personality/emotional-patterns.ts`
 *    for relationship stage management.
 *
 * 4. **Unified emotional memory**: Use `memory/emotional-memory-unified.ts`
 *    ```typescript
 *    import { getUnifiedEmotionalMemory } from '../memory/emotional-memory-unified.js';
 *    const memory = getUnifiedEmotionalMemory({ userId, personaId });
 *    ```
 *
 * The new systems use semantic search and integrate with the unified
 * memory architecture for better cross-session continuity.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { createLogger } from '../utils/safe-logger.js';
import type {
  PersonalityRelationship,
  PersonalityRelationshipDoc,
  PersonalMomentTopic,
  SharedMomentRecord,
  UserMomentRecord,
} from './types.js';

const log = createLogger({ module: 'RelationshipMemory' });

// Lazy Firestore initialization to avoid startup issues
let firestoreInstance: FirebaseFirestore.Firestore | null = null;

function getDb(): FirebaseFirestore.Firestore | null {
  if (!firestoreInstance) {
    try {
      firestoreInstance = getFirestore();
    } catch (e) {
      log.warn({ error: String(e) }, 'Firestore not available - using cache only');
      return null;
    }
  }
  return firestoreInstance;
}

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

const relationshipCache = new Map<string, PersonalityRelationship>();

function getCacheKey(userId: string, personaId: string): string {
  return `${userId}:${personaId}`;
}

// ============================================================================
// FIRESTORE HELPERS (to be integrated)
// ============================================================================

// Collection path for personality relationships
const COLLECTION_PATH = 'personality_relationships';

/**
 * Convert Firestore document to PersonalityRelationship
 */
function fromFirestore(doc: PersonalityRelationshipDoc): PersonalityRelationship {
  return {
    userId: doc.userId,
    personaId: doc.personaId,
    createdAt: new Date(doc.createdAt),
    lastInteraction: new Date(doc.lastInteraction),
    sharedMoments: doc.sharedMoments.map((sm) => ({
      ...sm,
      sharedAt: new Date(sm.sharedAt),
    })),
    userMoments: doc.userMoments.map((um) => ({
      ...um,
      sharedAt: new Date(um.sharedAt),
      followUpAfter: um.followUpAfter ? new Date(um.followUpAfter) : undefined,
      followedUpAt: um.followedUpAt ? new Date(um.followedUpAt) : undefined,
    })),
    discoveredTopics: doc.discoveredTopics,
    vulnerabilityDepth: doc.vulnerabilityDepth,
  };
}

/**
 * Convert PersonalityRelationship to Firestore document
 */
function toFirestore(rel: PersonalityRelationship): PersonalityRelationshipDoc {
  return {
    userId: rel.userId,
    personaId: rel.personaId,
    createdAt: rel.createdAt.toISOString(),
    lastInteraction: rel.lastInteraction.toISOString(),
    sharedMoments: rel.sharedMoments.map((sm) => ({
      ...sm,
      sharedAt: sm.sharedAt.toISOString(),
    })),
    userMoments: rel.userMoments.map((um) => ({
      ...um,
      sharedAt: um.sharedAt.toISOString(),
      followUpAfter: um.followUpAfter?.toISOString(),
      followedUpAt: um.followedUpAt?.toISOString(),
    })),
    discoveredTopics: rel.discoveredTopics,
    vulnerabilityDepth: rel.vulnerabilityDepth,
  };
}

/**
 * Get Firestore document ID for a relationship
 */
function getDocId(userId: string, personaId: string): string {
  return `${userId}_${personaId}`;
}

/**
 * Load relationship from Firestore
 */
async function loadFromFirestore(
  userId: string,
  personaId: string
): Promise<PersonalityRelationship | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const docId = getDocId(userId, personaId);
    const docRef = db.collection(COLLECTION_PATH).doc(docId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data() as PersonalityRelationshipDoc;
    return fromFirestore(data);
  } catch (e) {
    log.warn({ error: String(e), userId, personaId }, 'Failed to load relationship from Firestore');
    return null;
  }
}

/**
 * Save relationship to Firestore (fire-and-forget with error logging)
 */
function saveToFirestore(relationship: PersonalityRelationship): void {
  const db = getDb();
  if (!db) return;

  const docId = getDocId(relationship.userId, relationship.personaId);
  const docRef = db.collection(COLLECTION_PATH).doc(docId);
  const data = toFirestore(relationship);

  // Fire and forget - don't block on persistence
  docRef
    .set(data, { merge: true })
    .then(() => {
      log.debug(
        { userId: relationship.userId, personaId: relationship.personaId },
        '💾 Relationship saved to Firestore'
      );
    })
    .catch((e) => {
      log.warn(
        { error: String(e), userId: relationship.userId, personaId: relationship.personaId },
        'Failed to save relationship to Firestore'
      );
    });
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get or create a relationship record
 */
export async function getRelationship(
  userId: string,
  personaId: string
): Promise<PersonalityRelationship> {
  const cacheKey = getCacheKey(userId, personaId);

  // Check cache first
  const cached = relationshipCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Try to load from Firestore
  const fromDb = await loadFromFirestore(userId, personaId);
  if (fromDb) {
    relationshipCache.set(cacheKey, fromDb);
    log.debug({ userId, personaId }, '📖 Loaded relationship from Firestore');
    return fromDb;
  }

  // Create new relationship if not found
  const relationship: PersonalityRelationship = {
    userId,
    personaId,
    createdAt: new Date(),
    lastInteraction: new Date(),
    sharedMoments: [],
    userMoments: [],
    discoveredTopics: [],
    vulnerabilityDepth: 0,
  };

  relationshipCache.set(cacheKey, relationship);

  // Persist new relationship
  saveToFirestore(relationship);

  return relationship;
}

/**
 * Record that a persona moment was shared with the user
 */
export async function recordSharedMoment(
  userId: string,
  personaId: string,
  momentId: string,
  topic: PersonalMomentTopic,
  context: string,
  userReaction?: string
): Promise<void> {
  const relationship = await getRelationship(userId, personaId);

  const record: SharedMomentRecord = {
    momentId,
    sharedAt: new Date(),
    context,
    userReaction,
    hasFollowedUp: false,
  };

  relationship.sharedMoments.push(record);
  relationship.lastInteraction = new Date();

  // Track discovered topics
  if (!relationship.discoveredTopics.includes(topic)) {
    relationship.discoveredTopics.push(topic);
  }

  // Update cache
  const cacheKey = getCacheKey(userId, personaId);
  relationshipCache.set(cacheKey, relationship);

  log.debug({ userId, personaId, momentId, topic }, '📝 Recorded shared moment');

  // Persist to Firestore
  saveToFirestore(relationship);
}

/**
 * Record a user moment for potential callback
 */
export async function recordUserMoment(
  userId: string,
  personaId: string,
  moment: Omit<UserMomentRecord, 'id' | 'sharedAt'>
): Promise<string> {
  const relationship = await getRelationship(userId, personaId);

  const id = `um_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const record: UserMomentRecord = {
    ...moment,
    id,
    sharedAt: new Date(),
  };

  relationship.userMoments.push(record);
  relationship.lastInteraction = new Date();

  // Update cache
  const cacheKey = getCacheKey(userId, personaId);
  relationshipCache.set(cacheKey, relationship);

  log.debug(
    { userId, personaId, momentId: id, category: moment.category },
    '📝 Recorded user moment for callback'
  );

  // Persist to Firestore
  saveToFirestore(relationship);

  return id;
}

/**
 * Mark a user moment as followed up
 */
export async function markCallbackComplete(
  userId: string,
  personaId: string,
  userMomentId: string
): Promise<void> {
  const relationship = await getRelationship(userId, personaId);

  const moment = relationship.userMoments.find((um) => um.id === userMomentId);
  if (moment) {
    moment.followedUp = true;
    moment.followedUpAt = new Date();

    // Update cache
    const cacheKey = getCacheKey(userId, personaId);
    relationshipCache.set(cacheKey, relationship);

    log.debug({ userId, personaId, userMomentId }, '✅ Marked callback complete');

    // Persist to Firestore
    saveToFirestore(relationship);
  }
}

/**
 * Get user moments that haven't been followed up on
 */
export async function getPendingUserMoments(
  userId: string,
  personaId: string
): Promise<UserMomentRecord[]> {
  const relationship = await getRelationship(userId, personaId);
  return relationship.userMoments.filter((um) => !um.followedUp);
}

/**
 * Check if a persona moment was already shared with this user
 */
export async function wasMomentShared(
  userId: string,
  personaId: string,
  momentId: string
): Promise<boolean> {
  const relationship = await getRelationship(userId, personaId);
  return relationship.sharedMoments.some((sm) => sm.momentId === momentId);
}

/**
 * Get count of times a moment was shared
 */
export async function getShareCount(
  userId: string,
  personaId: string,
  momentId: string
): Promise<number> {
  const relationship = await getRelationship(userId, personaId);
  return relationship.sharedMoments.filter((sm) => sm.momentId === momentId).length;
}

/**
 * Get all discovered topics for a relationship
 */
export async function getDiscoveredTopics(
  userId: string,
  personaId: string
): Promise<PersonalMomentTopic[]> {
  const relationship = await getRelationship(userId, personaId);
  return relationship.discoveredTopics;
}

/**
 * Increment vulnerability depth (used when deep/sacred moments are shared)
 */
export async function incrementVulnerabilityDepth(
  userId: string,
  personaId: string
): Promise<void> {
  const relationship = await getRelationship(userId, personaId);
  relationship.vulnerabilityDepth++;

  const cacheKey = getCacheKey(userId, personaId);
  relationshipCache.set(cacheKey, relationship);

  // Persist to Firestore
  saveToFirestore(relationship);
}

/**
 * Clear cache (for testing)
 */
export function clearCache(): void {
  relationshipCache.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getRelationship,
  recordSharedMoment,
  recordUserMoment,
  markCallbackComplete,
  getPendingUserMoments,
  wasMomentShared,
  getShareCount,
  getDiscoveredTopics,
  incrementVulnerabilityDepth,
  clearCache,
};
