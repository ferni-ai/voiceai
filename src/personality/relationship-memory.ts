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
 */

import { createLogger } from '../utils/safe-logger.js';
import type {
  PersonalityRelationship,
  PersonalityRelationshipDoc,
  PersonalMomentTopic,
  SharedMomentRecord,
  UserMomentRecord,
} from './types.js';

const log = createLogger({ module: 'RelationshipMemory' });

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

  // TODO: Load from Firestore
  // For now, create new relationship
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

  // TODO: Persist to Firestore
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

  // TODO: Persist to Firestore

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

    // TODO: Persist to Firestore
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

  // TODO: Persist to Firestore
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
