/**
 * Firestore Adapter for Unified Memory Store
 *
 * Wraps the existing FirestoreStore to provide a unified interface.
 * Handles memory persistence, retrieval, and basic queries.
 *
 * @module memory/unified-store/adapters/firestore-adapter
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  MemoryStoreAdapter,
  StoredMemory,
  SearchParams,
  ScoredMemory,
  StoreHealth,
  MemoryType,
} from '../types.js';

const log = createLogger({ module: 'FirestoreAdapter' });

// ============================================================================
// TYPES
// ============================================================================

interface FirestoreInstance {
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

interface FirestoreAdapterConfig {
  projectId?: string;
  databaseId?: string;
}

// ============================================================================
// FIRESTORE ADAPTER
// ============================================================================

/**
 * Firestore adapter for the unified memory store
 *
 * Provides primary persistence for memories using Google Cloud Firestore.
 */
export class FirestoreAdapter implements MemoryStoreAdapter {
  readonly name = 'firestore';

  private db: FirestoreInstance | null = null;
  private config: FirestoreAdapterConfig;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  // Metrics
  private successCount = 0;
  private errorCount = 0;
  private lastError: string | undefined;
  private lastSuccess: Date | undefined;
  private avgLatencyMs = 0;
  private latencyCount = 0;

  private readonly USERS_COLLECTION = 'bogle_users';
  private readonly MEMORIES_SUBCOLLECTION = 'unified_memories';

  constructor(config?: FirestoreAdapterConfig) {
    this.config = {
      projectId: config?.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: config?.databaseId || process.env.FIRESTORE_DATABASE || '(default)',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();

    try {
      await this.initPromise;
    } catch (error) {
      this.initPromise = null;
      throw error;
    }
  }

  private async doInitialize(): Promise<void> {
    try {
      const { Firestore } = await import('@google-cloud/firestore');

      this.db = new Firestore({
        projectId: this.config.projectId,
        databaseId: this.config.databaseId,
      }) as unknown as FirestoreInstance;

      this.initialized = true;
      log.info({ projectId: this.config.projectId }, 'Firestore adapter initialized');
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to initialize Firestore adapter');
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async store(memory: StoredMemory): Promise<void> {
    await this.ensureInitialized();
    const startTime = Date.now();

    try {
      const docRef = this.getMemoryDocRef(memory.userId, memory.id);

      // Convert to Firestore-safe format
      const firestoreDoc = this.toFirestoreDoc(memory);

      await docRef.set(firestoreDoc, { merge: false });

      this.recordSuccess(Date.now() - startTime);
      log.debug({ userId: memory.userId, memoryId: memory.id }, 'Memory stored');
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  async get(userId: string, memoryId: string): Promise<StoredMemory | null> {
    await this.ensureInitialized();
    const startTime = Date.now();

    try {
      const docRef = this.getMemoryDocRef(userId, memoryId);
      const snapshot = await docRef.get();

      if (!snapshot.exists) {
        this.recordSuccess(Date.now() - startTime);
        return null;
      }

      const memory = this.fromFirestoreDoc(snapshot.id, snapshot.data()!);
      this.recordSuccess(Date.now() - startTime);
      return memory;
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  async update(userId: string, memoryId: string, updates: Partial<StoredMemory>): Promise<void> {
    await this.ensureInitialized();
    const startTime = Date.now();

    try {
      const docRef = this.getMemoryDocRef(userId, memoryId);

      // Convert updates to Firestore format
      const firestoreUpdates = this.toFirestoreDoc({
        ...updates,
        updatedAt: new Date(),
      } as StoredMemory);

      await docRef.set(firestoreUpdates, { merge: true });

      this.recordSuccess(Date.now() - startTime);
      log.debug({ userId, memoryId }, 'Memory updated');
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  async delete(userId: string, memoryId: string): Promise<void> {
    await this.ensureInitialized();
    const startTime = Date.now();

    try {
      const docRef = this.getMemoryDocRef(userId, memoryId);
      await docRef.delete();

      this.recordSuccess(Date.now() - startTime);
      log.debug({ userId, memoryId }, 'Memory deleted');
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEARCH OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async search(params: SearchParams): Promise<ScoredMemory[]> {
    await this.ensureInitialized();
    const startTime = Date.now();

    try {
      const memoriesRef = this.getMemoriesCollectionRef(params.userId);
      let query: Query = memoriesRef as unknown as Query;

      // Apply type filter
      if (params.types && params.types.length > 0) {
        query = query.where('type', 'in', params.types);
      }

      // Apply custom filters
      if (params.filters) {
        for (const [field, value] of Object.entries(params.filters)) {
          query = query.where(field, '==', value);
        }
      }

      // Order by importance/recency
      query = query.orderBy('importance', 'desc');

      // Limit results
      const limit = params.topK || 10;
      query = query.limit(limit);

      const snapshot = await query.get();

      const results: ScoredMemory[] = [];
      for (const doc of snapshot.docs) {
        const memory = this.fromFirestoreDoc(doc.id, doc.data()!);
        results.push({
          memory,
          score: memory.importance, // Basic scoring from importance
          scoreBreakdown: {
            semantic: 0, // Will be filled by vector adapter
            temporal: this.calculateTemporalScore(memory),
            emotional: memory.emotionalWeight,
            contextual: 0,
          },
          reason: 'Firestore query match',
          triggerType: 'keyword',
        });
      }

      this.recordSuccess(Date.now() - startTime);
      return results;
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH & MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  async health(): Promise<StoreHealth> {
    const totalOps = this.successCount + this.errorCount;
    const errorRate = totalOps > 0 ? this.errorCount / totalOps : 0;

    return {
      healthy: this.initialized && errorRate < 0.1,
      name: this.name,
      initialized: this.initialized,
      latencyMs: this.avgLatencyMs,
      errorRate,
      lastError: this.lastError,
      lastSuccess: this.lastSuccess,
    };
  }

  async shutdown(): Promise<void> {
    if (this.db) {
      await this.db.terminate();
      this.db = null;
      this.initialized = false;
      log.info('Firestore adapter shut down');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH OPERATIONS (for efficiency)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Store multiple memories in a batch
   */
  async storeBatch(memories: StoredMemory[]): Promise<void> {
    await this.ensureInitialized();
    const startTime = Date.now();

    try {
      // Firestore batches have a limit of 500 operations
      const BATCH_SIZE = 500;
      for (let i = 0; i < memories.length; i += BATCH_SIZE) {
        const batch = memories.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map((m) => this.store(m)));
      }

      this.recordSuccess(Date.now() - startTime);
      log.debug({ count: memories.length }, 'Batch stored');
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  /**
   * Get memories by user
   */
  async getByUser(
    userId: string,
    options?: { limit?: number; types?: MemoryType[] }
  ): Promise<StoredMemory[]> {
    await this.ensureInitialized();
    const startTime = Date.now();

    try {
      const memoriesRef = this.getMemoriesCollectionRef(userId);
      let query: Query = memoriesRef as unknown as Query;

      if (options?.types && options.types.length > 0) {
        query = query.where('type', 'in', options.types);
      }

      query = query.orderBy('createdAt', 'desc');

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const snapshot = await query.get();

      const memories: StoredMemory[] = [];
      for (const doc of snapshot.docs) {
        memories.push(this.fromFirestoreDoc(doc.id, doc.data()!));
      }

      this.recordSuccess(Date.now() - startTime);
      return memories;
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private getMemoryDocRef(userId: string, memoryId: string): DocumentReference {
    return this.db!.collection(this.USERS_COLLECTION)
      .doc(userId)
      .collection(this.MEMORIES_SUBCOLLECTION)
      .doc(memoryId);
  }

  private getMemoriesCollectionRef(userId: string): CollectionReference {
    return this.db!.collection(this.USERS_COLLECTION)
      .doc(userId)
      .collection(this.MEMORIES_SUBCOLLECTION);
  }

  private toFirestoreDoc(memory: Partial<StoredMemory>): Record<string, unknown> {
    const doc: Record<string, unknown> = { ...memory };

    // Convert Dates to Firestore Timestamps
    if (memory.createdAt) doc.createdAt = memory.createdAt;
    if (memory.updatedAt) doc.updatedAt = memory.updatedAt;
    if (memory.lastAccessedAt) doc.lastAccessedAt = memory.lastAccessedAt;

    // Don't store large embeddings in main document (use vector store)
    delete doc.embedding;

    return doc;
  }

  private fromFirestoreDoc(id: string, data: Record<string, unknown>): StoredMemory {
    return {
      id,
      userId: data.userId as string,
      type: data.type as MemoryType,
      subtype: data.subtype as string | undefined,
      content: data.content as string,
      embedding: [], // Will be filled by vector adapter
      createdAt: this.toDate(data.createdAt),
      updatedAt: this.toDate(data.updatedAt),
      lastAccessedAt: this.toDate(data.lastAccessedAt),
      accessCount: (data.accessCount as number) || 0,
      emotionalWeight: (data.emotionalWeight as number) || 0,
      strength: (data.strength as number) || 1,
      importance: (data.importance as number) || 0.5,
      isProtected: (data.isProtected as boolean) || false,
      isActiveCommitment: (data.isActiveCommitment as boolean) || false,
      topics: (data.topics as string[]) || [],
      personaIds: (data.personaIds as string[]) || [],
      peopleMentioned: (data.peopleMentioned as string[]) || [],
      sessionId: data.sessionId as string | undefined,
      conversationId: data.conversationId as string | undefined,
      metadata: (data.metadata as Record<string, unknown>) || {},
      storageLayer: 'firestore',
    };
  }

  private toDate(value: unknown): Date {
    if (!value) return new Date();
    if (value instanceof Date) return value;
    if (typeof value === 'object' && 'toDate' in value) {
      return (value as { toDate: () => Date }).toDate();
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return new Date(value);
    }
    return new Date();
  }

  private calculateTemporalScore(memory: StoredMemory): number {
    const now = Date.now();
    const memoryTime = memory.createdAt.getTime();
    const daysSinceCreation = (now - memoryTime) / (1000 * 60 * 60 * 24);

    // Exponential decay with half-life of 30 days
    return Math.pow(0.5, daysSinceCreation / 30);
  }

  private recordSuccess(latencyMs: number): void {
    this.successCount++;
    this.lastSuccess = new Date();

    // Running average of latency
    this.latencyCount++;
    this.avgLatencyMs = this.avgLatencyMs + (latencyMs - this.avgLatencyMs) / this.latencyCount;
  }

  private recordError(error: unknown): void {
    this.errorCount++;
    this.lastError = String(error);
    log.error({ error: String(error) }, 'Firestore adapter error');
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let instance: FirestoreAdapter | null = null;

/**
 * Get or create the Firestore adapter singleton
 */
export function getFirestoreAdapter(config?: FirestoreAdapterConfig): FirestoreAdapter {
  if (!instance) {
    instance = new FirestoreAdapter(config);
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetFirestoreAdapter(): void {
  instance = null;
}
