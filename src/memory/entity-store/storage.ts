/**
 * Unified Entity Store - Firestore Storage Layer
 *
 * Single source of truth for all entities (people, places, events, concepts).
 *
 * Collection structure:
 *   entity_store/{userId}/entities/{entityId}
 *   entity_store/{userId}/mentions/{mentionId}
 *   entity_store/{userId}/relationships/{relationshipId}
 *
 * @module memory/entity-store/storage
 */

import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import type {
  Entity,
  EntityRelationship,
  EntitySearchOptions,
  EntityType,
  Mention,
} from './types.js';

const log = createLogger({ module: 'entity-store:storage' });

// ============================================================================
// CONSTANTS
// ============================================================================

const ENTITY_STORE_COLLECTION = 'entity_store';
const ENTITIES_SUBCOLLECTION = 'entities';
const MENTIONS_SUBCOLLECTION = 'mentions';
const RELATIONSHIPS_SUBCOLLECTION = 'relationships';

// ============================================================================
// FIRESTORE ACCESS
// ============================================================================

let firestoreInstance: FirebaseFirestore.Firestore | null = null;

async function getFirestore(): Promise<FirebaseFirestore.Firestore> {
  if (firestoreInstance) return firestoreInstance;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    firestoreInstance = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    return firestoreInstance;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize Firestore');
    throw error;
  }
}

// ============================================================================
// ENTITY OPERATIONS
// ============================================================================

/**
 * Get the entities collection reference for a user
 */
async function getEntitiesRef(userId: string) {
  const db = await getFirestore();
  return db.collection(ENTITY_STORE_COLLECTION).doc(userId).collection(ENTITIES_SUBCOLLECTION);
}

/**
 * Create a new entity
 */
export async function createEntity(userId: string, entity: Omit<Entity, 'id'>): Promise<Entity> {
  const ref = await getEntitiesRef(userId);
  const docRef = ref.doc();

  const fullEntity: Entity = {
    ...entity,
    id: docRef.id,
    userId,
    createdAt: new Date(),
    updatedAt: new Date(),
    mentionCount: entity.mentionCount || 0,
    salience: entity.salience || 0.5,
    emotionalWeight: entity.emotionalWeight || 0.5,
    confidence: entity.confidence || 0.8,
    topics: entity.topics || [],
    aliases: entity.aliases || [],
  };

  await docRef.set(cleanForFirestore(fullEntity));

  log.info(
    { userId, entityId: fullEntity.id, name: fullEntity.canonicalName, type: fullEntity.type },
    '✨ Created entity'
  );

  return fullEntity;
}

/**
 * Get an entity by ID
 */
export async function getEntity(userId: string, entityId: string): Promise<Entity | null> {
  const ref = await getEntitiesRef(userId);
  const doc = await ref.doc(entityId).get();

  if (!doc.exists) return null;

  const data = doc.data();
  return {
    ...data,
    id: doc.id,
    createdAt: data?.createdAt?.toDate?.() || new Date(),
    updatedAt: data?.updatedAt?.toDate?.() || new Date(),
    firstMentionedAt: data?.firstMentionedAt?.toDate?.() || new Date(),
    lastMentionedAt: data?.lastMentionedAt?.toDate?.() || new Date(),
  } as Entity;
}

/**
 * Update an entity
 */
export async function updateEntity(
  userId: string,
  entityId: string,
  updates: Partial<Entity>
): Promise<Entity | null> {
  const ref = await getEntitiesRef(userId);
  const docRef = ref.doc(entityId);

  const existing = await docRef.get();
  if (!existing.exists) return null;

  const updateData = {
    ...updates,
    updatedAt: new Date(),
  };

  await docRef.update(cleanForFirestore(updateData));

  log.debug({ userId, entityId }, 'Updated entity');

  return getEntity(userId, entityId);
}

/**
 * Delete an entity
 */
export async function deleteEntity(userId: string, entityId: string): Promise<boolean> {
  const ref = await getEntitiesRef(userId);
  const docRef = ref.doc(entityId);

  const existing = await docRef.get();
  if (!existing.exists) return false;

  await docRef.delete();
  log.info({ userId, entityId }, 'Deleted entity');

  return true;
}

/**
 * Find entity by alias (name, nickname, relationship term)
 */
export async function findEntityByAlias(
  userId: string,
  alias: string,
  type?: EntityType
): Promise<Entity | null> {
  const ref = await getEntitiesRef(userId);
  const normalizedAlias = alias.toLowerCase().trim();

  // First try canonical name
  let query = ref.where('canonicalName', '==', alias);
  if (type) query = query.where('type', '==', type);

  let snapshot = await query.limit(1).get();
  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    return { ...doc.data(), id: doc.id } as Entity;
  }

  // Then check specific relation (for "my brother", "my mom", etc.)
  if (type === 'person' || !type) {
    query = ref.where('specificRelation', '==', normalizedAlias);
    snapshot = await query.limit(1).get();
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return { ...doc.data(), id: doc.id } as Entity;
    }
  }

  // Finally check aliases array (requires composite index)
  // Note: Firestore array-contains is case-sensitive, so we store lowercase aliases
  query = ref.where('aliases', 'array-contains', normalizedAlias);
  if (type) query = query.where('type', '==', type);

  snapshot = await query.limit(1).get();
  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    return { ...doc.data(), id: doc.id } as Entity;
  }

  return null;
}

/**
 * Search entities by various criteria
 */
export async function searchEntities(
  userId: string,
  searchText: string,
  options: EntitySearchOptions = {}
): Promise<Entity[]> {
  const ref = await getEntitiesRef(userId);
  const normalizedSearch = searchText.toLowerCase().trim();
  const limit = options.limit || 10;

  // Build query
  let query: FirebaseFirestore.Query = ref;

  if (options.types && options.types.length > 0) {
    query = query.where('type', 'in', options.types);
  }

  if (options.relationships && options.relationships.length > 0) {
    query = query.where('relationship', 'in', options.relationships);
  }

  if (options.minSalience) {
    query = query.where('salience', '>=', options.minSalience);
  }

  // Get all and filter in memory (Firestore doesn't support text search)
  const snapshot = await query.orderBy('salience', 'desc').limit(100).get();

  const results: Entity[] = [];
  for (const doc of snapshot.docs) {
    const entity = { ...doc.data(), id: doc.id } as Entity;

    // Check if search text matches
    const matchesName = entity.canonicalName?.toLowerCase().includes(normalizedSearch);
    const matchesAlias = entity.aliases?.some((a) => a.toLowerCase().includes(normalizedSearch));
    const matchesRelation = entity.specificRelation?.toLowerCase().includes(normalizedSearch);

    if (matchesName || matchesAlias || matchesRelation) {
      results.push(entity);
      if (results.length >= limit) break;
    }
  }

  return results;
}

/**
 * Get all entities for a user
 */
export async function getAllEntities(
  userId: string,
  options: EntitySearchOptions = {}
): Promise<Entity[]> {
  const ref = await getEntitiesRef(userId);
  const limit = options.limit || options.topK || 100;

  let query: FirebaseFirestore.Query = ref;

  if (options.types && options.types.length > 0) {
    query = query.where('type', 'in', options.types);
  }

  // Use lastMentioned (not lastMentionedAt) to match Entity schema
  const snapshot = await query.orderBy('lastMentioned', 'desc').limit(limit).get();

  return snapshot.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
    createdAt: doc.data()?.createdAt?.toDate?.() || new Date(),
    updatedAt: doc.data()?.updatedAt?.toDate?.() || new Date(),
    firstMentionedAt: doc.data()?.firstMentionedAt?.toDate?.() || new Date(),
    lastMentionedAt: doc.data()?.lastMentionedAt?.toDate?.() || new Date(),
  })) as Entity[];
}

/**
 * Get entities by type
 */
export async function getEntitiesByType(
  userId: string,
  type: EntityType,
  limit = 50
): Promise<Entity[]> {
  const ref = await getEntitiesRef(userId);
  const snapshot = await ref
    .where('type', '==', type)
    .orderBy('salience', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })) as Entity[];
}

// ============================================================================
// MENTION OPERATIONS
// ============================================================================

/**
 * Get the mentions collection reference for a user
 */
async function getMentionsRef(userId: string) {
  const db = await getFirestore();
  return db.collection(ENTITY_STORE_COLLECTION).doc(userId).collection(MENTIONS_SUBCOLLECTION);
}

/**
 * Create a mention
 */
export async function createMention(
  userId: string,
  mention: Omit<Mention, 'id'>
): Promise<Mention> {
  const ref = await getMentionsRef(userId);
  const docRef = ref.doc();

  const fullMention: Mention = {
    ...mention,
    id: docRef.id,
    userId,
    timestamp: mention.timestamp || new Date(),
    sentiment: mention.sentiment || 0,
    emotionalIntensity: mention.emotionalIntensity || 0.5,
    topics: mention.topics || [],
    facts: mention.facts || [],
  };

  await docRef.set(cleanForFirestore(fullMention));

  log.debug({ userId, mentionId: fullMention.id, entityId: mention.entityId }, 'Created mention');

  return fullMention;
}

/**
 * Get mentions for an entity
 */
export async function getMentionsForEntity(
  userId: string,
  entityId: string,
  limit = 50
): Promise<Mention[]> {
  const ref = await getMentionsRef(userId);
  const snapshot = await ref
    .where('entityId', '==', entityId)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
    timestamp: doc.data()?.timestamp?.toDate?.() || new Date(),
  })) as Mention[];
}

/**
 * Get recent mentions for a user
 */
export async function getRecentMentions(userId: string, limit = 20): Promise<Mention[]> {
  const ref = await getMentionsRef(userId);
  const snapshot = await ref.orderBy('timestamp', 'desc').limit(limit).get();

  return snapshot.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
    timestamp: doc.data()?.timestamp?.toDate?.() || new Date(),
  })) as Mention[];
}

// ============================================================================
// RELATIONSHIP (EDGE) OPERATIONS
// ============================================================================

/**
 * Get the relationships collection reference for a user
 */
async function getRelationshipsRef(userId: string) {
  const db = await getFirestore();
  return db.collection(ENTITY_STORE_COLLECTION).doc(userId).collection(RELATIONSHIPS_SUBCOLLECTION);
}

/**
 * Create or update a relationship between entities
 */
export async function upsertRelationship(
  userId: string,
  relationship: Omit<EntityRelationship, 'id'>
): Promise<EntityRelationship> {
  const ref = await getRelationshipsRef(userId);

  // Check for existing relationship
  const existing = await ref
    .where('fromEntity', '==', relationship.fromEntity)
    .where('toEntity', '==', relationship.toEntity)
    .where('type', '==', relationship.type)
    .limit(1)
    .get();

  if (!existing.empty) {
    // Update existing
    const docRef = existing.docs[0].ref;
    await docRef.update(
      cleanForFirestore({
        ...relationship,
        lastReinforced: new Date(),
        reinforcementCount:
          ((existing.docs[0].data() as EntityRelationship).reinforcementCount || 0) + 1,
      })
    );
    return { ...existing.docs[0].data(), id: existing.docs[0].id } as EntityRelationship;
  }

  // Create new
  const docRef = ref.doc();
  const now = new Date();
  const fullRelationship: EntityRelationship = {
    ...relationship,
    id: docRef.id,
    firstLinked: now,
    lastReinforced: now,
    reinforcementCount: 1,
    bidirectional: relationship.bidirectional ?? false,
  };

  await docRef.set(cleanForFirestore(fullRelationship));

  log.debug(
    {
      userId,
      fromEntity: relationship.fromEntity,
      toEntity: relationship.toEntity,
      type: relationship.type,
    },
    'Created relationship'
  );

  return fullRelationship;
}

/**
 * Get relationships for an entity
 */
export async function getRelationshipsForEntity(
  userId: string,
  entityId: string
): Promise<EntityRelationship[]> {
  const ref = await getRelationshipsRef(userId);

  // Get relationships where entity is either source or target
  const [fromSnapshot, toSnapshot] = await Promise.all([
    ref.where('fromEntity', '==', entityId).get(),
    ref.where('toEntity', '==', entityId).get(),
  ]);

  const relationships: EntityRelationship[] = [];

  for (const doc of fromSnapshot.docs) {
    relationships.push({ ...doc.data(), id: doc.id } as EntityRelationship);
  }

  for (const doc of toSnapshot.docs) {
    // Avoid duplicates
    if (!relationships.some((r) => r.id === doc.id)) {
      relationships.push({ ...doc.data(), id: doc.id } as EntityRelationship);
    }
  }

  return relationships;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Increment mention count and update last mentioned timestamp
 */
export async function recordMention(
  userId: string,
  entityId: string,
  mentionData?: {
    sentiment?: number;
    topics?: string[];
  }
): Promise<void> {
  const ref = await getEntitiesRef(userId);
  const docRef = ref.doc(entityId);

  const updates: Record<string, unknown> = {
    mentionCount: (await import('@google-cloud/firestore')).FieldValue.increment(1),
    lastMentionedAt: new Date(),
    updatedAt: new Date(),
  };

  // Update salience based on recency (simple decay + boost)
  if (mentionData?.sentiment !== undefined) {
    // Boost emotional weight if strong sentiment
    if (Math.abs(mentionData.sentiment) > 0.5) {
      updates.emotionalWeight = (await import('@google-cloud/firestore')).FieldValue.increment(
        0.05
      );
    }
  }

  await docRef.update(cleanForFirestore(updates));
}

/**
 * Check if entity store is initialized for a user
 */
export async function hasEntityStore(userId: string): Promise<boolean> {
  try {
    const ref = await getEntitiesRef(userId);
    const snapshot = await ref.limit(1).get();
    return !snapshot.empty;
  } catch {
    return false;
  }
}

/**
 * Get entity store stats for a user
 */
export async function getEntityStoreStats(userId: string): Promise<{
  entityCount: number;
  mentionCount: number;
  relationshipCount: number;
  entityTypes: Record<EntityType, number>;
}> {
  const [entitiesRef, mentionsRef, relationshipsRef] = await Promise.all([
    getEntitiesRef(userId),
    getMentionsRef(userId),
    getRelationshipsRef(userId),
  ]);

  const [entitiesSnap, mentionsSnap, relationshipsSnap] = await Promise.all([
    entitiesRef.get(),
    mentionsRef.get(),
    relationshipsRef.get(),
  ]);

  const entityTypes: Record<string, number> = {};
  for (const doc of entitiesSnap.docs) {
    const type = doc.data()?.type || 'unknown';
    entityTypes[type] = (entityTypes[type] || 0) + 1;
  }

  return {
    entityCount: entitiesSnap.size,
    mentionCount: mentionsSnap.size,
    relationshipCount: relationshipsSnap.size,
    entityTypes: entityTypes as Record<EntityType, number>,
  };
}

/**
 * Alias for getRelationshipsForEntity - backward compatibility
 */
export const getEntityRelationships = getRelationshipsForEntity;
