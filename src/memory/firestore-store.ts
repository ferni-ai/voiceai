/**
 * Google Cloud Firestore Memory Store
 *
 * Production-grade persistent storage using Google Cloud Firestore.
 *
 * Requires: npm install @google-cloud/firestore
 *
 * Environment:
 * - GOOGLE_CLOUD_PROJECT: Your GCP project ID
 * - GOOGLE_APPLICATION_CREDENTIALS: Path to service account JSON
 */

import { getLogger } from '../utils/safe-logger.js';
import { MemoryStore, type QueryOptions, type SearchResult } from './store.js';
import type {
  UserProfile,
  ConversationSummary,
  KeyMoment,
  FinancialGoal,
} from '../types/user-profile.js';
import {
  isValidUserProfile,
  isValidConversationSummary,
  isValidKeyMoment,
  isValidFinancialGoal,
} from './type-guards.js';

// ============================================================================
// TYPES
// ============================================================================

interface FirestoreConfig {
  projectId?: string;
  databaseId?: string;
  credentials?: {
    client_email: string;
    private_key: string;
  };
  /**
   * Connection pooling settings for performance optimization.
   * These reduce cold start latency by maintaining warm connections.
   */
  pooling?: {
    /** Minimum gRPC channels to maintain (default: 2) */
    minChannels?: number;
    /** Maximum idle gRPC channels (default: 10) */
    maxIdleChannels?: number;
  };
}

interface Firestore {
  collection: (path: string) => CollectionReference;
  terminate: () => Promise<void>;
}

interface CollectionReference {
  doc: (id: string) => DocumentReference;
  orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
  limit: (n: number) => Query;
  where: (field: string, op: string, value: unknown) => Query;
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
}

interface QuerySnapshot {
  empty: boolean;
  docs: DocumentSnapshot[];
  size: number;
}

interface Query {
  orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
  limit: (n: number) => Query;
  offset: (n: number) => Query;
  where: (field: string, op: string, value: unknown) => Query;
  get: () => Promise<QuerySnapshot>;
}

// ============================================================================
// FIRESTORE STORE
// ============================================================================

export class FirestoreStore extends MemoryStore {
  private db: Firestore | null = null;
  private config: FirestoreConfig;
  private readonly USERS_COLLECTION = 'bogle_users';
  // FIX: Cache initialization promise to prevent race conditions
  private initPromise: Promise<void> | null = null;

  constructor(config?: FirestoreConfig) {
    super();
    // Merge provided config with defaults
    const defaults: FirestoreConfig = {
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    };
    this.config = { ...defaults, ...config };
  }

  /**
   * FIX: Initialize with proper race condition handling
   * The initPromise is now only cleared after successful initialization
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    // Return cached promise if initialization is in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    // Start initialization and cache the promise
    this.initPromise = this.doInitialize();

    try {
      await this.initPromise;
      // FIX: Only clear promise after successful initialization
      // so subsequent calls during init return the same promise
    } catch (error) {
      // FIX: Clear promise on error so retry is possible
      this.initPromise = null;
      throw error;
    }
  }

  private async doInitialize(): Promise<void> {
    try {
      const { Firestore } = await import('@google-cloud/firestore');

      // Connection pooling settings for performance optimization
      // These reduce cold start latency by 100-200ms by maintaining warm connections
      const poolingDefaults = {
        minChannels: 2, // Keep at least 2 channels warm
        maxIdleChannels: 10, // Allow up to 10 idle channels for burst traffic
      };

      this.db = new Firestore({
        projectId: this.config.projectId,
        databaseId: this.config.databaseId,
        ...(this.config.credentials && { credentials: this.config.credentials }),
        // Apply connection pooling settings
        ...poolingDefaults,
        ...this.config.pooling,
      }) as unknown as Firestore;

      this._initialized = true;
      getLogger().info(
        `Firestore store initialized with connection pooling (project: ${this.config.projectId}, minChannels: ${this.config.pooling?.minChannels ?? poolingDefaults.minChannels})`
      );
    } catch (error) {
      getLogger().error(`Firestore initialization failed: ${error}`);
      throw error;
    }
  }

  /**
   * Ensure Firestore is initialized before any operation.
   * This enables true lazy initialization - connect on first use, not startup.
   * @returns The initialized Firestore instance (guaranteed non-null)
   */
  private async ensureInitialized(): Promise<Firestore> {
    if (this._initialized && this.db) return this.db;
    await this.initialize();
    if (!this.db) throw new Error('FirestoreStore failed to initialize');
    return this.db;
  }

  /**
   * FIX: Helper to get db with explicit null check instead of assertion
   * Throws a descriptive error if db is null (indicates a bug in initialization flow)
   */
  private getDb(): Firestore {
    if (!this.db) {
      throw new Error('FirestoreStore.db is null after initialization - this is a bug');
    }
    return this.db;
  }

  /**
   * Get the raw Firestore database instance.
   * Ensures initialization before returning.
   * Use this when you need direct access to Firestore APIs (e.g., for custom collections).
   */
  async getDatabase(): Promise<Firestore> {
    return this.ensureInitialized();
  }

  // ============================================================================
  // USER PROFILE OPERATIONS
  // ============================================================================

  async getProfile(userId: string): Promise<UserProfile | null> {
    const db = await this.ensureInitialized();

    try {
      const docRef = db.collection(this.USERS_COLLECTION).doc(userId);
      const doc = await docRef.get();

      if (!doc.exists) return null;

      const data = doc.data();
      if (!data) return null;

      const hydrated = this.hydrateData(data);
      if (!isValidUserProfile(hydrated)) {
        // FIX: Enhanced logging with data sample for debugging data corruption
        getLogger().error(
          {
            userId,
            hasId: !!hydrated?.id,
            hasName: !!hydrated?.name,
            hasCreatedAt: !!hydrated?.createdAt,
            dataKeys: Object.keys(hydrated || {}),
          },
          'Invalid user profile data from Firestore - potential data corruption'
        );
        return null;
      }
      return hydrated;
    } catch (error) {
      getLogger().error(`getProfile error: ${error}`);
      return null;
    }
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    const db = await this.ensureInitialized();

    try {
      const docRef = db.collection(this.USERS_COLLECTION).doc(profile.id);
      const serialized = this.serializeForFirestore(profile);

      await docRef.set(serialized, { merge: true });
      getLogger().debug(`Saved profile: ${profile.id}`);
    } catch (error) {
      getLogger().error(`saveProfile error: ${error}`);
      throw error;
    }
  }

  async deleteProfile(userId: string): Promise<boolean> {
    const db = await this.ensureInitialized();

    try {
      const docRef = db.collection(this.USERS_COLLECTION).doc(userId);
      await docRef.delete();
      return true;
    } catch (error) {
      getLogger().error(`deleteProfile error: ${error}`);
      return false;
    }
  }

  async hasProfile(userId: string): Promise<boolean> {
    const db = await this.ensureInitialized();

    try {
      const docRef = db.collection(this.USERS_COLLECTION).doc(userId);
      const doc = await docRef.get();
      return doc.exists;
    } catch (error) {
      getLogger().error(`hasProfile error: ${error}`);
      return false;
    }
  }

  async listProfiles(options?: QueryOptions): Promise<UserProfile[]> {
    const db = await this.ensureInitialized();

    try {
      const limit = options?.limit || 100;
      let query: Query = db
        .collection(this.USERS_COLLECTION)
        .orderBy(options?.sortBy || 'updatedAt', options?.sortOrder || 'desc');

      query = query.limit(limit);

      if (options?.offset) {
        query = query.offset(options.offset);
      }

      const snapshot = await query.get();
      const profiles: UserProfile[] = [];
      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (!data) continue;
        const hydrated = this.hydrateData(data);
        if (isValidUserProfile(hydrated)) {
          profiles.push(hydrated);
        }
      }
      return profiles;
    } catch (error) {
      getLogger().error(`listProfiles error: ${error}`);
      return [];
    }
  }

  // ============================================================================
  // CONVERSATION SUMMARY OPERATIONS
  // ============================================================================

  async saveSummary(userId: string, summary: ConversationSummary): Promise<void> {
    const db = await this.ensureInitialized();

    try {
      const summaryRef = db
        .collection(this.USERS_COLLECTION)
        .doc(userId)
        .collection('summaries')
        .doc(summary.id);

      await summaryRef.set(this.serializeForFirestore(summary));
      getLogger().debug(`Saved summary: ${summary.id}`);
    } catch (error) {
      getLogger().error(`saveSummary error: ${error}`);
      throw error;
    }
  }

  async getSummaries(userId: string, options?: QueryOptions): Promise<ConversationSummary[]> {
    const db = await this.ensureInitialized();

    try {
      const limit = options?.limit || 10;

      let query: Query = db
        .collection(this.USERS_COLLECTION)
        .doc(userId)
        .collection('summaries')
        .orderBy('timestamp', 'desc')
        .limit(limit);

      if (options?.offset) {
        query = query.offset(options.offset);
      }

      const snapshot = await query.get();

      if (snapshot.empty) return [];

      const summaries: ConversationSummary[] = [];
      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (!data) continue;
        const hydrated = this.hydrateData(data);
        if (isValidConversationSummary(hydrated)) {
          summaries.push(hydrated);
        }
      }
      return summaries;
    } catch (error) {
      getLogger().error(`getSummaries error: ${error}`);
      return [];
    }
  }

  // ============================================================================
  // KEY MOMENT OPERATIONS
  // ============================================================================

  async addKeyMoment(userId: string, moment: KeyMoment): Promise<void> {
    const db = await this.ensureInitialized();

    try {
      const momentId = moment.id || `moment_${Date.now()}`;
      const momentRef = db
        .collection(this.USERS_COLLECTION)
        .doc(userId)
        .collection('moments')
        .doc(momentId);

      await momentRef.set(this.serializeForFirestore({ ...moment, id: momentId }));
      getLogger().debug(`Added key moment for user: ${userId}`);
    } catch (error) {
      getLogger().error(`addKeyMoment error: ${error}`);
      throw error;
    }
  }

  async getKeyMoments(userId: string, options?: QueryOptions): Promise<KeyMoment[]> {
    const db = await this.ensureInitialized();

    try {
      const limit = options?.limit || 50;

      const query: Query = db
        .collection(this.USERS_COLLECTION)
        .doc(userId)
        .collection('moments')
        .orderBy('timestamp', 'desc')
        .limit(limit);

      const snapshot = await query.get();

      if (snapshot.empty) return [];

      const moments: KeyMoment[] = [];
      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (!data) continue;
        const hydrated = this.hydrateData(data);
        if (isValidKeyMoment(hydrated)) {
          moments.push(hydrated);
        }
      }
      return moments;
    } catch (error) {
      getLogger().error(`getKeyMoments error: ${error}`);
      return [];
    }
  }

  // ============================================================================
  // GOAL OPERATIONS
  // ============================================================================

  async saveGoal(userId: string, goal: FinancialGoal): Promise<void> {
    const db = await this.ensureInitialized();

    try {
      const goalRef = db
        .collection(this.USERS_COLLECTION)
        .doc(userId)
        .collection('goals')
        .doc(goal.id);

      await goalRef.set(this.serializeForFirestore(goal), { merge: true });
      getLogger().debug(`Saved goal: ${goal.id}`);
    } catch (error) {
      getLogger().error(`saveGoal error: ${error}`);
      throw error;
    }
  }

  async getGoals(userId: string): Promise<FinancialGoal[]> {
    const db = await this.ensureInitialized();

    try {
      const snapshot = await db
        .collection(this.USERS_COLLECTION)
        .doc(userId)
        .collection('goals')
        .get();

      if (snapshot.empty) return [];

      const goals: FinancialGoal[] = [];
      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (!data) continue;
        const hydrated = this.hydrateData(data);
        if (isValidFinancialGoal(hydrated)) {
          goals.push(hydrated);
        }
      }
      return goals;
    } catch (error) {
      getLogger().error(`getGoals error: ${error}`);
      return [];
    }
  }

  async deleteGoal(userId: string, goalId: string): Promise<boolean> {
    const db = await this.ensureInitialized();

    try {
      await db
        .collection(this.USERS_COLLECTION)
        .doc(userId)
        .collection('goals')
        .doc(goalId)
        .delete();
      return true;
    } catch (error) {
      getLogger().error(`deleteGoal error: ${error}`);
      return false;
    }
  }

  // ============================================================================
  // SEARCH OPERATIONS
  // ============================================================================

  async searchProfiles(
    query: string,
    options?: QueryOptions
  ): Promise<Array<SearchResult<UserProfile>>> {
    const db = await this.ensureInitialized();

    try {
      const limit = options?.limit || 10;
      const queryLower = query.toLowerCase();

      const q: Query = db
        .collection(this.USERS_COLLECTION)
        .where('nameLower', '>=', queryLower)
        .where('nameLower', '<=', `${queryLower}\uf8ff`)
        .limit(limit);

      const snapshot = await q.get();

      const results: Array<SearchResult<UserProfile>> = [];
      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (!data) continue;
        const hydrated = this.hydrateData(data);
        if (isValidUserProfile(hydrated)) {
          results.push({ item: hydrated, score: 1.0 });
        }
      }
      return results;
    } catch (error) {
      getLogger().error(`searchProfiles error: ${error}`);
      return [];
    }
  }

  // ============================================================================
  // ATOMIC PROFILE UPDATE (Transaction-wrapped)
  // ============================================================================

  /**
   * Atomically update a user profile using a transaction.
   * Ensures that read-modify-write operations are safe from race conditions.
   *
   * @param userId - The user ID to update
   * @param updater - Function that receives current profile and returns updated profile
   * @param options - Transaction options
   * @returns The updated profile, or null if user doesn't exist and createIfMissing is false
   */
  async atomicProfileUpdate(
    userId: string,
    updater: (profile: UserProfile) => UserProfile | Promise<UserProfile>,
    options: {
      createIfMissing?: boolean;
      maxRetries?: number;
    } = {}
  ): Promise<UserProfile | null> {
    const db = await this.ensureInitialized();

    const { createIfMissing = false, maxRetries = 3 } = options;

    try {
      // Import Firestore for transaction support
      const { Firestore } = await import('@google-cloud/firestore');
      const db = this.db as unknown as InstanceType<typeof Firestore>;

      const docRef = db.collection(this.USERS_COLLECTION).doc(userId);

      // Run transaction
      const result = await db.runTransaction(
        async (transaction) => {
          const doc = await transaction.get(docRef);

          let currentProfile: UserProfile | null = null;

          if (doc.exists) {
            const data = doc.data();
            if (data) {
              const hydrated = this.hydrateData(data as Record<string, unknown>);
              if (isValidUserProfile(hydrated)) {
                currentProfile = hydrated;
              }
            }
          }

          if (!currentProfile) {
            if (!createIfMissing) {
              return null;
            }
            // Create a new profile
            const { createUserProfile } = await import('../types/user-profile.js');
            currentProfile = createUserProfile(userId);
          }

          // Apply the update
          const updatedProfile = await updater(currentProfile);

          // Ensure updatedAt is set
          updatedProfile.updatedAt = new Date();
          updatedProfile.version = (currentProfile.version || 0) + 1;

          // Serialize and save
          const serialized = this.serializeForFirestore(updatedProfile);
          transaction.set(docRef, serialized, { merge: true });

          return updatedProfile;
        },
        { maxAttempts: maxRetries }
      );

      if (result) {
        getLogger().debug(`Atomic update completed for profile: ${userId}`);
      }

      return result;
    } catch (error) {
      const errorStr = String(error);

      // FIX: Distinguish between transient errors (handled by Firestore retry)
      // and permanent errors (should fail fast)
      if (
        errorStr.includes('ABORTED') ||
        errorStr.includes('UNAVAILABLE') ||
        errorStr.includes('DEADLINE_EXCEEDED')
      ) {
        // Transient errors - Firestore's maxAttempts handles retries
        getLogger().warn(
          { userId, error: errorStr },
          'atomicProfileUpdate: transient error (retries exhausted)'
        );
      } else if (
        errorStr.includes('PERMISSION_DENIED') ||
        errorStr.includes('NOT_FOUND') ||
        errorStr.includes('INVALID_ARGUMENT')
      ) {
        // Permanent errors - no retry will help
        getLogger().error(
          { userId, error: errorStr },
          'atomicProfileUpdate: permanent error - check permissions or data'
        );
      } else {
        // Unknown errors
        getLogger().error({ userId, error: errorStr }, 'atomicProfileUpdate: unexpected error');
      }

      throw error;
    }
  }

  /**
   * Batch update multiple profiles atomically
   * Useful for bulk operations like migrations
   */
  async batchProfileUpdate(
    updates: Array<{
      userId: string;
      updater: (profile: UserProfile) => UserProfile;
    }>
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const db = await this.ensureInitialized();

    const results = { success: 0, failed: 0, errors: [] as string[] };

    // Process in batches of 10 (Firestore transaction limit is 500 writes)
    const batchSize = 10;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async ({ userId, updater }) => {
          try {
            await this.atomicProfileUpdate(userId, updater);
            results.success++;
          } catch (error) {
            results.failed++;
            results.errors.push(`${userId}: ${error}`);
          }
        })
      );
    }

    return results;
  }

  // ============================================================================
  // CLOSE
  // ============================================================================

  async close(): Promise<void> {
    if (this.db) {
      await this.db.terminate();
      this.db = null;
      this._initialized = false;
      getLogger().info('Firestore connection closed');
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private serializeForFirestore(data: unknown): Record<string, unknown> {
    const serialized = JSON.parse(
      JSON.stringify(data, (key, value) => {
        if (value === undefined) return null;
        if (value instanceof Date) return value.toISOString();
        return value;
      })
    );

    if (serialized.name) {
      serialized.nameLower = serialized.name.toLowerCase();
    }

    return serialized;
  }

  /**
   * Hydrate raw Firestore data by converting date strings/timestamps to Date objects.
   * Returns a Record that should then be validated with type guards.
   */
  private hydrateData(data: Record<string, unknown>): Record<string, unknown> {
    const dateFields = [
      'firstContact',
      'lastContact',
      'createdAt',
      'updatedAt',
      'timestamp',
      'sharedAt',
      'targetDate',
      'assessedAt',
      'followUpDate',
    ];

    const hydrated = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;

    const hydrateObject = (obj: Record<string, unknown>): void => {
      for (const [key, value] of Object.entries(obj)) {
        // Handle Firestore Timestamp objects
        if (value && typeof value === 'object' && '_seconds' in value) {
          const ts = value as { _seconds: number; _nanoseconds: number };
          obj[key] = new Date(ts._seconds * 1000 + ts._nanoseconds / 1000000);
        }
        // Handle ISO string dates
        else if (dateFields.includes(key) && typeof value === 'string') {
          obj[key] = new Date(value);
        }
        // Recursively handle arrays
        else if (Array.isArray(value)) {
          for (const item of value) {
            if (typeof item === 'object' && item !== null) {
              hydrateObject(item as Record<string, unknown>);
            }
          }
        }
        // Recursively handle nested objects
        else if (value && typeof value === 'object') {
          hydrateObject(value as Record<string, unknown>);
        }
      }
    };

    hydrateObject(hydrated);
    return hydrated;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let firestoreInstance: FirestoreStore | null = null;

export function getFirestoreStore(config?: FirestoreConfig): FirestoreStore {
  if (!firestoreInstance) {
    firestoreInstance = new FirestoreStore(config);
  }
  return firestoreInstance;
}

export async function resetFirestoreStore(): Promise<void> {
  if (firestoreInstance) {
    await firestoreInstance.close();
    firestoreInstance = null;
  }
}

export default FirestoreStore;
