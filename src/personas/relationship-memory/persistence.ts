/**
 * Relationship Memory Persistence
 *
 * > "Your best friend forgets. We don't."
 *
 * Firestore persistence layer for relationship memories.
 * Saves and loads the complete relationship history between users and personas.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import type {
  CallbackAttempt,
  CallbackEffectiveness,
  EmotionalTrajectory,
  InsideJoke,
  InsideJokeSeed,
  RelationshipMemory,
  RelationshipMilestone,
  RelationshipStage,
  SharedMoment,
  TemporalPattern,
} from './types.js';

const log = getLogger();

// ============================================================================
// FIRESTORE TYPES (lazy-loaded)
// ============================================================================

interface Firestore {
  collection: (path: string) => CollectionReference;
}

interface CollectionReference {
  doc: (id: string) => DocumentReference;
  where: (field: string, op: string, value: unknown) => Query;
  get: () => Promise<QuerySnapshot>;
}

interface DocumentReference {
  id: string;
  set: (data: unknown, options?: { merge?: boolean }) => Promise<unknown>;
  get: () => Promise<DocumentSnapshot>;
  delete: () => Promise<unknown>;
}

interface DocumentSnapshot {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  id: string;
}

interface QuerySnapshot {
  empty: boolean;
  docs: DocumentSnapshot[];
}

interface Query {
  get: () => Promise<QuerySnapshot>;
  limit: (n: number) => Query;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTION_NAME = 'relationship_memories';

// ============================================================================
// SERIALIZATION HELPERS
// ============================================================================

/**
 * Convert Date objects to Firestore Timestamps for storage
 */
function serializeForFirestore(memory: RelationshipMemory): Record<string, unknown> {
  return {
    userId: memory.userId,
    personaId: memory.personaId,
    stage: memory.stage,
    trustScore: memory.trustScore,
    trustFactors: memory.trustFactors,

    // Serialize arrays with dates
    sharedMoments: memory.sharedMoments.map((m) => ({
      ...m,
      timestamp: m.timestamp.toISOString(),
      lastCallback: m.lastCallback?.toISOString(),
    })),

    insideJokes: memory.insideJokes.map((j) => ({
      ...j,
      createdAt: j.createdAt.toISOString(),
      lastUsed: j.lastUsed?.toISOString(),
    })),

    insideJokeSeeds: memory.insideJokeSeeds.map((s) => ({
      ...s,
      timestamp: s.timestamp.toISOString(),
    })),

    // Filter out undefined values that Firestore rejects
    milestones: memory.milestones.map((m) => {
      const milestone: Record<string, unknown> = { ...m };
      // Convert dates to ISO strings, but only if they exist
      if (m.reachedAt) {
        milestone.reachedAt = m.reachedAt.toISOString();
      } else {
        delete milestone.reachedAt;
      }
      if (m.acknowledgedAt) {
        milestone.acknowledgedAt = m.acknowledgedAt.toISOString();
      } else {
        delete milestone.acknowledgedAt;
      }
      return milestone;
    }),

    callbackAttempts: memory.callbackAttempts.map((c) => ({
      ...c,
      timestamp: c.timestamp.toISOString(),
    })),

    callbackEffectiveness: memory.callbackEffectiveness.map((e) => ({
      ...e,
      lastAttempt: e.lastAttempt.toISOString(),
    })),

    temporalPatterns: memory.temporalPatterns,

    emotionalTrajectory: {
      ...memory.emotionalTrajectory,
      recentSessions: memory.emotionalTrajectory.recentSessions.map((s) => ({
        ...s,
        date: s.date.toISOString(),
      })),
      concerns: memory.emotionalTrajectory.concerns.map((c) => ({
        ...c,
        firstNoticed: c.firstNoticed.toISOString(),
      })),
      growthAreas: memory.emotionalTrajectory.growthAreas.map((g) => ({
        ...g,
        firstNoticed: g.firstNoticed.toISOString(),
      })),
    },

    // Meta dates
    firstConversation: memory.firstConversation.toISOString(),
    lastConversation: memory.lastConversation.toISOString(),
    totalSessions: memory.totalSessions,
    totalTurns: memory.totalTurns,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Convert Firestore document back to RelationshipMemory
 */
function deserializeFromFirestore(data: Record<string, unknown>): RelationshipMemory {
  return {
    userId: data.userId as string,
    personaId: data.personaId as string,
    stage: data.stage as RelationshipStage,
    trustScore: data.trustScore as number,
    trustFactors: data.trustFactors as RelationshipMemory['trustFactors'],

    sharedMoments: ((data.sharedMoments as Array<Record<string, unknown>>) || []).map((m) => ({
      ...m,
      timestamp: new Date(m.timestamp as string),
      lastCallback: m.lastCallback ? new Date(m.lastCallback as string) : undefined,
    })) as SharedMoment[],

    insideJokes: ((data.insideJokes as Array<Record<string, unknown>>) || []).map((j) => ({
      ...j,
      createdAt: new Date(j.createdAt as string),
      lastUsed: j.lastUsed ? new Date(j.lastUsed as string) : undefined,
    })) as InsideJoke[],

    insideJokeSeeds: ((data.insideJokeSeeds as Array<Record<string, unknown>>) || []).map((s) => ({
      ...s,
      timestamp: new Date(s.timestamp as string),
    })) as InsideJokeSeed[],

    milestones: ((data.milestones as Array<Record<string, unknown>>) || []).map((m) => ({
      ...m,
      reachedAt: m.reachedAt ? new Date(m.reachedAt as string) : undefined,
      acknowledgedAt: m.acknowledgedAt ? new Date(m.acknowledgedAt as string) : undefined,
    })) as RelationshipMilestone[],

    callbackAttempts: ((data.callbackAttempts as Array<Record<string, unknown>>) || []).map(
      (c) => ({
        ...c,
        timestamp: new Date(c.timestamp as string),
      })
    ) as CallbackAttempt[],

    callbackEffectiveness: (
      (data.callbackEffectiveness as Array<Record<string, unknown>>) || []
    ).map((e) => ({
      ...e,
      lastAttempt: new Date(e.lastAttempt as string),
    })) as CallbackEffectiveness[],

    temporalPatterns: data.temporalPatterns as TemporalPattern,

    emotionalTrajectory: {
      recentSessions: (
        ((data.emotionalTrajectory as Record<string, unknown>)?.recentSessions as Array<
          Record<string, unknown>
        >) || []
      ).map((s) => ({
        ...s,
        date: new Date(s.date as string),
      })),
      trendDirection: (data.emotionalTrajectory as Record<string, unknown>)
        ?.trendDirection as EmotionalTrajectory['trendDirection'],
      trendConfidence: (data.emotionalTrajectory as Record<string, unknown>)
        ?.trendConfidence as number,
      concerns: (
        ((data.emotionalTrajectory as Record<string, unknown>)?.concerns as Array<
          Record<string, unknown>
        >) || []
      ).map((c) => ({
        ...c,
        firstNoticed: new Date(c.firstNoticed as string),
      })),
      growthAreas: (
        ((data.emotionalTrajectory as Record<string, unknown>)?.growthAreas as Array<
          Record<string, unknown>
        >) || []
      ).map((g) => ({
        ...g,
        firstNoticed: new Date(g.firstNoticed as string),
      })),
    } as EmotionalTrajectory,

    firstConversation: new Date(data.firstConversation as string),
    lastConversation: new Date(data.lastConversation as string),
    totalSessions: data.totalSessions as number,
    totalTurns: data.totalTurns as number,
    updatedAt: new Date(data.updatedAt as string),
  };
}

// ============================================================================
// PERSISTENCE CLASS
// ============================================================================

/**
 * Firestore persistence for relationship memories
 */
export class RelationshipMemoryPersistence {
  private db: Firestore | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(firestore?: Firestore) {
    if (firestore) {
      this.db = firestore;
    }
  }

  /**
   * Initialize Firestore connection (lazy)
   */
  private async ensureInitialized(): Promise<Firestore> {
    if (this.db) return this.db;

    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    await this.initPromise;

    if (!this.db) {
      throw new Error('Failed to initialize Firestore');
    }
    return this.db;
  }

  private async initialize(): Promise<void> {
    try {
      const { Firestore: FirestoreClass } = await import('@google-cloud/firestore');
      this.db = new FirestoreClass({
        projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
        databaseId: process.env.FIRESTORE_DATABASE || '(default)',
      }) as unknown as Firestore;
      log.info('RelationshipMemoryPersistence initialized');
    } catch (error) {
      log.error({ error }, 'Failed to initialize Firestore for relationship memory');
      throw error;
    }
  }

  /**
   * Generate document ID for user-persona pair
   */
  private getDocId(userId: string, personaId: string): string {
    return `${userId}_${personaId}`;
  }

  // ============================================================================
  // CRUD OPERATIONS
  // ============================================================================

  /**
   * Save relationship memory to Firestore
   */
  async save(memory: RelationshipMemory): Promise<void> {
    const db = await this.ensureInitialized();
    const docId = this.getDocId(memory.userId, memory.personaId);

    try {
      const data = serializeForFirestore(memory);
      await db.collection(COLLECTION_NAME).doc(docId).set(cleanForFirestore(data), { merge: true });

      log.debug(
        {
          userId: memory.userId,
          personaId: memory.personaId,
          stage: memory.stage,
          trustScore: memory.trustScore,
        },
        'Saved relationship memory'
      );
    } catch (error) {
      log.error(
        { error, userId: memory.userId, personaId: memory.personaId },
        'Failed to save relationship memory'
      );
      throw error;
    }
  }

  /**
   * Load relationship memory from Firestore
   */
  async load(userId: string, personaId: string): Promise<RelationshipMemory | null> {
    const db = await this.ensureInitialized();
    const docId = this.getDocId(userId, personaId);

    try {
      const doc = await db.collection(COLLECTION_NAME).doc(docId).get();

      if (!doc.exists) {
        log.debug({ userId, personaId }, 'No existing relationship memory found');
        return null;
      }

      const data = doc.data();
      if (!data) return null;

      const memory = deserializeFromFirestore(data);

      log.debug(
        {
          userId,
          personaId,
          stage: memory.stage,
          totalSessions: memory.totalSessions,
        },
        'Loaded relationship memory'
      );

      return memory;
    } catch (error) {
      log.error({ error, userId, personaId }, 'Failed to load relationship memory');
      throw error;
    }
  }

  /**
   * Delete relationship memory
   */
  async delete(userId: string, personaId: string): Promise<void> {
    const db = await this.ensureInitialized();
    const docId = this.getDocId(userId, personaId);

    try {
      await db.collection(COLLECTION_NAME).doc(docId).delete();
      log.info({ userId, personaId }, 'Deleted relationship memory');
    } catch (error) {
      log.error({ error, userId, personaId }, 'Failed to delete relationship memory');
      throw error;
    }
  }

  /**
   * Load all relationship memories for a user (across all personas)
   */
  async loadAllForUser(userId: string): Promise<RelationshipMemory[]> {
    const db = await this.ensureInitialized();

    try {
      const snapshot = await db.collection(COLLECTION_NAME).where('userId', '==', userId).get();

      if (snapshot.empty) {
        return [];
      }

      const memories = snapshot.docs
        .map((doc) => {
          const data = doc.data();
          return data ? deserializeFromFirestore(data) : null;
        })
        .filter((m): m is RelationshipMemory => m !== null);

      log.debug({ userId, count: memories.length }, 'Loaded all relationship memories for user');

      return memories;
    } catch (error) {
      log.error({ error, userId }, 'Failed to load all relationship memories');
      throw error;
    }
  }

  /**
   * Check if relationship exists
   */
  async exists(userId: string, personaId: string): Promise<boolean> {
    const db = await this.ensureInitialized();
    const docId = this.getDocId(userId, personaId);

    try {
      const doc = await db.collection(COLLECTION_NAME).doc(docId).get();
      return doc.exists;
    } catch (error) {
      log.error({ error, userId, personaId }, 'Failed to check relationship existence');
      return false;
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let persistenceInstance: RelationshipMemoryPersistence | null = null;

/**
 * Get the singleton persistence instance
 */
export function getRelationshipPersistence(): RelationshipMemoryPersistence {
  if (!persistenceInstance) {
    persistenceInstance = new RelationshipMemoryPersistence();
  }
  return persistenceInstance;
}

/**
 * Save relationship memory (convenience function)
 */
export async function saveRelationshipMemory(memory: RelationshipMemory): Promise<void> {
  return getRelationshipPersistence().save(memory);
}

/**
 * Load relationship memory (convenience function)
 */
export async function loadRelationshipMemory(
  userId: string,
  personaId: string
): Promise<RelationshipMemory | null> {
  return getRelationshipPersistence().load(userId, personaId);
}

/**
 * Load all relationship memories for a user (convenience function)
 */
export async function loadAllRelationshipMemories(userId: string): Promise<RelationshipMemory[]> {
  return getRelationshipPersistence().loadAllForUser(userId);
}

export default RelationshipMemoryPersistence;
