/**
 * Firestore Memory Persistence
 *
 * Persists associative memory and behavioral patterns to Firestore.
 * Used by the MemoryOrchestrator to maintain state across sessions.
 *
 * Schema:
 * - bogle_users/{userId}/associative_memory/{memoryId}  → AssociativeTrigger[]
 * - bogle_users/{userId}/behavioral_patterns/{patternType} → BehavioralPattern
 * - bogle_users/{userId}/communication_preferences → CommunicationPreferences
 * - bogle_users/{userId}/emotional_threads/{threadId} → EmotionalThread
 *
 * @module memory/firestore-memory-persistence
 */

import { createLogger } from '../utils/safe-logger.js';
import type {
  AssociativeTrigger,
  BehavioralPattern,
  EmotionalThread,
  MemoryItem,
} from './interfaces/index.js';

const log = createLogger({ module: 'FirestoreMemoryPersistence' });

// ============================================================================
// TYPES
// ============================================================================

// Minimal Firestore types (to avoid hard dependency)
interface Firestore {
  collection: (path: string) => CollectionReference;
}

interface CollectionReference {
  doc: (id: string) => DocumentReference;
  get: () => Promise<QuerySnapshot>;
}

interface DocumentReference {
  id: string;
  set: (data: unknown, options?: { merge?: boolean }) => Promise<unknown>;
  get: () => Promise<DocumentSnapshot>;
  delete: () => Promise<unknown>;
  collection: (name: string) => CollectionReference;
}

interface DocumentSnapshot {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  id: string;
  ref: DocumentReference;
}

interface QuerySnapshot {
  empty: boolean;
  docs: DocumentSnapshot[];
}

// Serialized versions for Firestore
interface SerializedTrigger extends Omit<AssociativeTrigger, 'createdAt' | 'lastFired'> {
  createdAt: string;
  lastFired: string;
}

interface SerializedPattern extends Omit<
  BehavioralPattern,
  'firstObserved' | 'lastObserved' | 'examples'
> {
  firstObserved: string;
  lastObserved: string;
  examples: Array<{
    context: string;
    behavior: string;
    timestamp: string;
  }>;
}

interface SerializedThread extends Omit<EmotionalThread, 'firstMentioned' | 'lastMentioned'> {
  firstMentioned: string;
  lastMentioned: string;
}

interface SerializedMemoryItem extends Omit<MemoryItem, 'timestamp'> {
  timestamp: string;
}

interface CommunicationPreferencesData {
  preferences: Array<{
    dimension: string;
    ourApproach: string;
    userResponse: string;
    situation: string;
    timestamp: string;
  }>;
  lastUpdated: string;
}

// ============================================================================
// FIRESTORE MEMORY PERSISTENCE
// ============================================================================

export class FirestoreMemoryPersistence {
  private db: Firestore | null = null;
  private readonly USERS_COLLECTION = 'bogle_users';

  constructor() {
    // Will be initialized lazily
  }

  /**
   * Initialize Firestore connection
   */
  async initialize(): Promise<void> {
    if (this.db) return;

    try {
      const { Firestore: FirestoreClass } = await import('@google-cloud/firestore');
      this.db = new FirestoreClass({
        projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
        databaseId: process.env.FIRESTORE_DATABASE || '(default)',
      }) as unknown as Firestore;
      log.info('Firestore memory persistence initialized');
    } catch (error) {
      log.warn({ error: String(error) }, 'Firestore not available, using in-memory fallback');
    }
  }

  /**
   * Check if Firestore is available
   */
  isAvailable(): boolean {
    return this.db !== null;
  }

  // ============================================================================
  // ASSOCIATIVE MEMORY
  // ============================================================================

  /**
   * Save associative memory triggers for a user
   */
  async saveAssociativeTriggers(
    userId: string,
    memoryId: string,
    triggers: AssociativeTrigger[],
    memory?: MemoryItem
  ): Promise<void> {
    if (!this.db) return;

    try {
      const userDoc = this.db.collection(this.USERS_COLLECTION).doc(userId);
      const triggerDoc = userDoc.collection('associative_memory').doc(memoryId);

      const serialized: SerializedTrigger[] = triggers.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
        lastFired: t.lastFired.toISOString(),
      }));

      const data: Record<string, unknown> = {
        triggers: serialized,
        updatedAt: new Date().toISOString(),
      };

      if (memory) {
        data.memory = {
          ...memory,
          timestamp: memory.timestamp.toISOString(),
        } as SerializedMemoryItem;
      }

      await triggerDoc.set(data, { merge: true });
      log.debug({ userId, memoryId, triggerCount: triggers.length }, 'Saved associative triggers');
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to save associative triggers');
    }
  }

  /**
   * Load all associative memory triggers for a user
   */
  async loadAssociativeTriggers(
    userId: string
  ): Promise<Map<string, { triggers: AssociativeTrigger[]; memory?: MemoryItem }>> {
    const result = new Map<string, { triggers: AssociativeTrigger[]; memory?: MemoryItem }>();
    if (!this.db) return result;

    try {
      const userDoc = this.db.collection(this.USERS_COLLECTION).doc(userId);
      const snapshot = await userDoc.collection('associative_memory').get();

      for (const doc of snapshot.docs) {
        const data = doc.data() as
          | {
              triggers: SerializedTrigger[];
              memory?: SerializedMemoryItem;
            }
          | undefined;

        if (data?.triggers) {
          const triggers: AssociativeTrigger[] = data.triggers.map((t) => ({
            ...t,
            createdAt: new Date(t.createdAt),
            lastFired: new Date(t.lastFired),
          }));

          let memory: MemoryItem | undefined;
          if (data.memory) {
            memory = {
              ...data.memory,
              timestamp: new Date(data.memory.timestamp),
            };
          }

          result.set(doc.id, { triggers, memory });
        }
      }

      log.debug({ userId, memoryCount: result.size }, 'Loaded associative triggers');
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to load associative triggers');
    }

    return result;
  }

  // ============================================================================
  // BEHAVIORAL PATTERNS
  // ============================================================================

  /**
   * Save behavioral patterns for a user
   */
  async saveBehavioralPatterns(userId: string, patterns: BehavioralPattern[]): Promise<void> {
    if (!this.db) return;

    try {
      const userDoc = this.db.collection(this.USERS_COLLECTION).doc(userId);

      for (const pattern of patterns) {
        const patternDoc = userDoc.collection('behavioral_patterns').doc(pattern.patternType);

        const serialized: SerializedPattern = {
          ...pattern,
          firstObserved: pattern.firstObserved.toISOString(),
          lastObserved: pattern.lastObserved.toISOString(),
          examples: pattern.examples.map((e) => ({
            ...e,
            timestamp: e.timestamp.toISOString(),
          })),
        };

        await patternDoc.set(serialized);
      }

      log.debug({ userId, patternCount: patterns.length }, 'Saved behavioral patterns');
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to save behavioral patterns');
    }
  }

  /**
   * Load behavioral patterns for a user
   */
  async loadBehavioralPatterns(userId: string): Promise<BehavioralPattern[]> {
    if (!this.db) return [];

    try {
      const userDoc = this.db.collection(this.USERS_COLLECTION).doc(userId);
      const snapshot = await userDoc.collection('behavioral_patterns').get();

      const patterns: BehavioralPattern[] = [];
      for (const doc of snapshot.docs) {
        const data = doc.data() as SerializedPattern | undefined;
        if (data) {
          patterns.push({
            ...data,
            firstObserved: new Date(data.firstObserved),
            lastObserved: new Date(data.lastObserved),
            examples: data.examples.map((e) => ({
              ...e,
              timestamp: new Date(e.timestamp),
            })),
          });
        }
      }

      log.debug({ userId, patternCount: patterns.length }, 'Loaded behavioral patterns');
      return patterns;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to load behavioral patterns');
      return [];
    }
  }

  // ============================================================================
  // EMOTIONAL THREADS
  // ============================================================================

  /**
   * Save emotional threads for a user
   */
  async saveEmotionalThreads(userId: string, threads: EmotionalThread[]): Promise<void> {
    if (!this.db) return;

    try {
      const userDoc = this.db.collection(this.USERS_COLLECTION).doc(userId);

      for (const thread of threads) {
        const threadDoc = userDoc.collection('emotional_threads').doc(thread.id);

        const serialized: SerializedThread = {
          ...thread,
          firstMentioned: thread.firstMentioned.toISOString(),
          lastMentioned: thread.lastMentioned.toISOString(),
        };

        await threadDoc.set(serialized);
      }

      log.debug({ userId, threadCount: threads.length }, 'Saved emotional threads');
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to save emotional threads');
    }
  }

  /**
   * Load emotional threads for a user
   */
  async loadEmotionalThreads(userId: string): Promise<EmotionalThread[]> {
    if (!this.db) return [];

    try {
      const userDoc = this.db.collection(this.USERS_COLLECTION).doc(userId);
      const snapshot = await userDoc.collection('emotional_threads').get();

      const threads: EmotionalThread[] = [];
      for (const doc of snapshot.docs) {
        const data = doc.data() as SerializedThread | undefined;
        if (data) {
          threads.push({
            ...data,
            firstMentioned: new Date(data.firstMentioned),
            lastMentioned: new Date(data.lastMentioned),
          });
        }
      }

      log.debug({ userId, threadCount: threads.length }, 'Loaded emotional threads');
      return threads;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to load emotional threads');
      return [];
    }
  }

  // ============================================================================
  // COMMUNICATION PREFERENCES
  // ============================================================================

  /**
   * Save communication preferences for a user
   */
  async saveCommunicationPreferences(
    userId: string,
    preferences: CommunicationPreferencesData['preferences']
  ): Promise<void> {
    if (!this.db) return;

    try {
      const userDoc = this.db.collection(this.USERS_COLLECTION).doc(userId);
      const prefDoc = userDoc.collection('memory_systems').doc('communication_preferences');

      const data: CommunicationPreferencesData = {
        preferences,
        lastUpdated: new Date().toISOString(),
      };

      await prefDoc.set(data);
      log.debug({ userId, prefCount: preferences.length }, 'Saved communication preferences');
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to save communication preferences');
    }
  }

  /**
   * Load communication preferences for a user
   */
  async loadCommunicationPreferences(
    userId: string
  ): Promise<CommunicationPreferencesData['preferences']> {
    if (!this.db) return [];

    try {
      const userDoc = this.db.collection(this.USERS_COLLECTION).doc(userId);
      const prefDoc = userDoc.collection('memory_systems').doc('communication_preferences');
      const snapshot = await prefDoc.get();

      if (snapshot.exists) {
        const data = snapshot.data() as CommunicationPreferencesData | undefined;
        if (data?.preferences) {
          log.debug(
            { userId, prefCount: data.preferences.length },
            'Loaded communication preferences'
          );
          return data.preferences;
        }
      }

      return [];
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to load communication preferences');
      return [];
    }
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Delete all memory data for a user (GDPR compliance)
   * FIX: Now handles individual delete failures gracefully and reports them
   */
  async deleteUserMemoryData(userId: string): Promise<void> {
    if (!this.db) return;

    try {
      const userDoc = this.db.collection(this.USERS_COLLECTION).doc(userId);

      // Batch fetch all collections in parallel (3x faster)
      const [assocSnapshot, patternSnapshot, threadSnapshot] = await Promise.all([
        userDoc.collection('associative_memory').get(),
        userDoc.collection('behavioral_patterns').get(),
        userDoc.collection('emotional_threads').get(),
      ]);

      // FIX: Track errors from individual deletes to ensure GDPR compliance
      const errors: string[] = [];
      let deleted = 0;

      // Collect all delete operations with individual error handling
      const deleteOps: Array<Promise<void>> = [];

      for (const doc of assocSnapshot.docs) {
        deleteOps.push(
          doc.ref
            .delete()
            .then(() => {
              deleted++;
            })
            .catch((err) => {
              errors.push(`associative_memory/${doc.id}: ${err}`);
            })
        );
      }
      for (const doc of patternSnapshot.docs) {
        deleteOps.push(
          doc.ref
            .delete()
            .then(() => {
              deleted++;
            })
            .catch((err) => {
              errors.push(`behavioral_patterns/${doc.id}: ${err}`);
            })
        );
      }
      for (const doc of threadSnapshot.docs) {
        deleteOps.push(
          doc.ref
            .delete()
            .then(() => {
              deleted++;
            })
            .catch((err) => {
              errors.push(`emotional_threads/${doc.id}: ${err}`);
            })
        );
      }

      // Delete communication preferences
      deleteOps.push(
        userDoc
          .collection('memory_systems')
          .doc('communication_preferences')
          .delete()
          .then(() => {
            deleted++;
          })
          .catch((err) => {
            errors.push(`communication_preferences: ${err}`);
          })
      );

      // Execute all deletes in parallel (individual failures won't kill the batch)
      await Promise.all(deleteOps);

      // FIX: Report partial failures for GDPR compliance tracking
      if (errors.length > 0) {
        log.error(
          { userId, errors, deleted, failed: errors.length },
          'GDPR deletion partially failed - some documents could not be deleted'
        );
      } else {
        log.info({ userId, deleted }, 'Deleted all user memory data');
      }
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to delete user memory data');
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let persistence: FirestoreMemoryPersistence | null = null;

/**
 * Get the Firestore memory persistence instance
 */
export async function getFirestoreMemoryPersistence(): Promise<FirestoreMemoryPersistence> {
  if (!persistence) {
    persistence = new FirestoreMemoryPersistence();
    await persistence.initialize();
  }
  return persistence;
}

/**
 * Reset the persistence instance (for testing)
 */
export function resetFirestoreMemoryPersistence(): void {
  persistence = null;
}

export default {
  FirestoreMemoryPersistence,
  getFirestoreMemoryPersistence,
  resetFirestoreMemoryPersistence,
};
