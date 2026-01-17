/**
 * Firestore Embedding Storage
 *
 * Stores embeddings separately from source documents in Firestore.
 * Collection structure: bogle_users/{userId}/embeddings/{embeddingId}
 *
 * Benefits:
 * - Source documents stay small (no 6KB embedding payload)
 * - Can migrate to vector DB later without changing source documents
 * - Native Firestore vector search with findNearest()
 *
 * @module memory/embedding-storage/firestore-embedding-storage
 */

import { createLogger } from '../../utils/safe-logger.js';
import { FieldValue } from '@google-cloud/firestore';
import type {
  StoredEmbedding,
  EmbeddingSourceType,
  EmbeddingSearchResult,
  EmbeddingStorageConfig,
  EmbeddingStorageHealth,
  IEmbeddingStorage,
  DEFAULT_CONFIG,
} from './types.js';

const log = createLogger({ module: 'firestore-embedding-storage' });

// ============================================================================
// LRU CACHE
// ============================================================================

interface CacheEntry {
  embedding: StoredEmbedding;
  accessedAt: number;
}

class EmbeddingCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private ttlMs: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): StoredEmbedding | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.accessedAt > this.ttlMs) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Update access time
    entry.accessedAt = Date.now();
    this.hits++;
    return entry.embedding;
  }

  set(key: string, embedding: StoredEmbedding): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of this.cache) {
        if (v.accessedAt < oldestTime) {
          oldestTime = v.accessedAt;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { embedding, accessedAt: Date.now() });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  getHitRate(): number {
    const total = this.hits + this.misses;
    return total > 0 ? this.hits / total : 0;
  }

  size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

// ============================================================================
// FIRESTORE EMBEDDING STORAGE
// ============================================================================

export class FirestoreEmbeddingStorage implements IEmbeddingStorage {
  private config: EmbeddingStorageConfig;
  private cache: EmbeddingCache;
  private errorCount = 0;
  private lastCleanupAt: Date | null = null;

  constructor(config: Partial<EmbeddingStorageConfig> = {}) {
    this.config = {
      collectionName: config.collectionName ?? 'embeddings',
      defaultModel: config.defaultModel ?? 'text-embedding-004',
      defaultDimension: config.defaultDimension ?? 768,
      maxBatchSize: config.maxBatchSize ?? 100,
      enableCache: config.enableCache ?? true,
      cacheMaxSize: config.cacheMaxSize ?? 1000,
      cacheTTLMs: config.cacheTTLMs ?? 5 * 60 * 1000,
    };

    this.cache = new EmbeddingCache(this.config.cacheMaxSize, this.config.cacheTTLMs);
  }

  // ============================================================================
  // STORE OPERATIONS
  // ============================================================================

  async store(embedding: Omit<StoredEmbedding, 'id' | 'createdAt'>): Promise<string> {
    try {
      const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
      const db = getFirestoreDb();

      if (!db) {
        throw new Error('Firestore not available');
      }

      const id = this.generateId(embedding.sourceType, embedding.sourceId);
      const collectionPath = `bogle_users/${embedding.userId}/${this.config.collectionName}`;

      const doc: StoredEmbedding = {
        ...embedding,
        id,
        createdAt: new Date(),
        dimension: embedding.vector.length,
        model: embedding.model || this.config.defaultModel,
      };

      // Use FieldValue.vector for native vector support
      const firestoreDoc = {
        ...doc,
        vector: FieldValue.vector(embedding.vector),
        createdAt: FieldValue.serverTimestamp(),
      };

      await db.collection(collectionPath).doc(id).set(firestoreDoc);

      // Update cache
      if (this.config.enableCache) {
        this.cache.set(id, doc);
      }

      log.debug(
        { userId: embedding.userId, sourceType: embedding.sourceType, embeddingId: id },
        'Stored embedding'
      );

      return id;
    } catch (error) {
      this.errorCount++;
      log.error({ error: String(error) }, 'Failed to store embedding');
      throw error;
    }
  }

  async storeBatch(
    embeddings: Array<Omit<StoredEmbedding, 'id' | 'createdAt'>>
  ): Promise<string[]> {
    if (embeddings.length === 0) return [];

    const ids: string[] = [];
    const batches: Array<Array<Omit<StoredEmbedding, 'id' | 'createdAt'>>> = [];

    // Split into batches
    for (let i = 0; i < embeddings.length; i += this.config.maxBatchSize) {
      batches.push(embeddings.slice(i, i + this.config.maxBatchSize));
    }

    for (const batch of batches) {
      const batchIds = await Promise.all(batch.map((e) => this.store(e)));
      ids.push(...batchIds);
    }

    return ids;
  }

  // ============================================================================
  // RETRIEVE OPERATIONS
  // ============================================================================

  async get(embeddingId: string): Promise<StoredEmbedding | null> {
    // Check cache first
    if (this.config.enableCache) {
      const cached = this.cache.get(embeddingId);
      if (cached) return cached;
    }

    try {
      const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
      const db = getFirestoreDb();

      if (!db) return null;

      // We need the userId to construct the path - extract from ID or search
      // For now, this requires knowing the userId. In practice, use getBySource.
      log.warn({ embeddingId }, 'get() requires userId - use getBySource() instead');
      return null;
    } catch (error) {
      this.errorCount++;
      log.error({ error: String(error), embeddingId }, 'Failed to get embedding');
      return null;
    }
  }

  async getBySource(
    userId: string,
    sourceType: EmbeddingSourceType,
    sourceId: string
  ): Promise<StoredEmbedding | null> {
    const embeddingId = this.generateId(sourceType, sourceId);

    // Check cache
    if (this.config.enableCache) {
      const cached = this.cache.get(embeddingId);
      if (cached) return cached;
    }

    try {
      const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
      const db = getFirestoreDb();

      if (!db) return null;

      const collectionPath = `bogle_users/${userId}/${this.config.collectionName}`;
      const docRef = db.collection(collectionPath).doc(embeddingId);
      const snapshot = await docRef.get();

      if (!snapshot.exists) return null;

      const data = snapshot.data();
      if (!data) return null;

      const embedding = this.hydrateEmbedding(data, embeddingId);

      // Update cache
      if (this.config.enableCache) {
        this.cache.set(embeddingId, embedding);
      }

      return embedding;
    } catch (error) {
      this.errorCount++;
      log.error({ error: String(error), userId, sourceType, sourceId }, 'Failed to get embedding');
      return null;
    }
  }

  async getBatch(embeddingIds: string[]): Promise<StoredEmbedding[]> {
    // For batch retrieval, we need userId context
    // This is a limitation - batch operations should use source-based retrieval
    log.warn({ count: embeddingIds.length }, 'getBatch() not implemented - use getBySource()');
    return [];
  }

  // ============================================================================
  // SEARCH OPERATIONS
  // ============================================================================

  async search(
    userId: string,
    queryVector: number[],
    limit: number,
    sourceTypes?: EmbeddingSourceType[]
  ): Promise<EmbeddingSearchResult[]> {
    try {
      const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
      const db = getFirestoreDb();

      if (!db) return [];

      const collectionPath = `bogle_users/${userId}/${this.config.collectionName}`;
      const collectionRef = db.collection(collectionPath);

      // Use Firestore native vector search
      // Note: Requires Vector Search index to be configured
      let query = collectionRef.findNearest({
        vectorField: 'vector',
        queryVector,
        limit: limit * 2, // Get more to filter by sourceType
        distanceMeasure: 'COSINE',
      });

      if (!query) {
        // Fallback if findNearest not available
        log.warn('findNearest not available - falling back to basic query');
        return this.fallbackSearch(userId, queryVector, limit, sourceTypes);
      }

      const snapshot = await query.get();

      const results: EmbeddingSearchResult[] = [];

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const embedding = this.hydrateEmbedding(data, doc.id);

        // Filter by sourceType if specified
        if (sourceTypes && sourceTypes.length > 0 && !sourceTypes.includes(embedding.sourceType)) {
          continue;
        }

        // Calculate cosine similarity
        const distance = data._distance ?? this.cosineDistance(queryVector, embedding.vector);
        const score = 1 - distance;

        results.push({ embedding, score, distance });

        if (results.length >= limit) break;
      }

      return results;
    } catch (error) {
      this.errorCount++;
      log.error({ error: String(error), userId }, 'Failed to search embeddings');
      return [];
    }
  }

  private async fallbackSearch(
    userId: string,
    queryVector: number[],
    limit: number,
    sourceTypes?: EmbeddingSourceType[]
  ): Promise<EmbeddingSearchResult[]> {
    // Fallback: Load embeddings and compute similarity in memory
    // This is slow and should only be used if vector search is unavailable
    try {
      const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
      const db = getFirestoreDb();

      if (!db) return [];

      const collectionPath = `bogle_users/${userId}/${this.config.collectionName}`;
      let query: FirebaseFirestore.Query = db.collection(collectionPath);

      if (sourceTypes && sourceTypes.length === 1) {
        query = query.where('sourceType', '==', sourceTypes[0]);
      }

      query = query.limit(500); // Limit to prevent memory issues

      const snapshot = await query.get();

      const results: EmbeddingSearchResult[] = [];

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const embedding = this.hydrateEmbedding(data, doc.id);

        if (sourceTypes && sourceTypes.length > 1 && !sourceTypes.includes(embedding.sourceType)) {
          continue;
        }

        const distance = this.cosineDistance(queryVector, embedding.vector);
        const score = 1 - distance;

        results.push({ embedding, score, distance });
      }

      // Sort by score descending
      results.sort((a, b) => b.score - a.score);

      return results.slice(0, limit);
    } catch (error) {
      log.error({ error: String(error) }, 'Fallback search failed');
      return [];
    }
  }

  // ============================================================================
  // DELETE OPERATIONS
  // ============================================================================

  async delete(embeddingId: string): Promise<boolean> {
    // Requires userId context - use deleteBySource instead
    log.warn({ embeddingId }, 'delete() requires userId - use deleteBySource()');
    return false;
  }

  async deleteBySource(
    userId: string,
    sourceType: EmbeddingSourceType,
    sourceId: string
  ): Promise<boolean> {
    const embeddingId = this.generateId(sourceType, sourceId);

    try {
      const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
      const db = getFirestoreDb();

      if (!db) return false;

      const collectionPath = `bogle_users/${userId}/${this.config.collectionName}`;
      await db.collection(collectionPath).doc(embeddingId).delete();

      // Remove from cache
      this.cache.delete(embeddingId);

      log.debug({ userId, sourceType, sourceId }, 'Deleted embedding');
      return true;
    } catch (error) {
      this.errorCount++;
      log.error({ error: String(error), userId, sourceType, sourceId }, 'Failed to delete embedding');
      return false;
    }
  }

  async deleteExpired(): Promise<number> {
    let deleted = 0;

    try {
      const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
      const db = getFirestoreDb();

      if (!db) return 0;

      const now = new Date();

      // Use collection group query to find all expired embeddings
      const expiredQuery = db
        .collectionGroup(this.config.collectionName)
        .where('expiresAt', '<', now)
        .limit(500);

      const snapshot = await expiredQuery.get();

      if (snapshot.empty) {
        this.lastCleanupAt = now;
        return 0;
      }

      const batch = db.batch();
      for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        this.cache.delete(doc.id);
        deleted++;
      }

      await batch.commit();
      this.lastCleanupAt = now;

      log.info({ deleted }, 'Deleted expired embeddings');
      return deleted;
    } catch (error) {
      this.errorCount++;
      log.error({ error: String(error) }, 'Failed to delete expired embeddings');
      return deleted;
    }
  }

  // ============================================================================
  // HEALTH OPERATIONS
  // ============================================================================

  async getHealth(): Promise<EmbeddingStorageHealth> {
    try {
      const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
      const db = getFirestoreDb();

      return {
        healthy: !!db,
        backend: 'firestore',
        totalEmbeddings: this.cache.size(), // Approximate
        cacheHitRate: this.cache.getHitRate(),
        lastCleanupAt: this.lastCleanupAt,
        errors: this.errorCount,
      };
    } catch {
      return {
        healthy: false,
        backend: 'firestore',
        totalEmbeddings: 0,
        cacheHitRate: 0,
        lastCleanupAt: null,
        errors: this.errorCount,
      };
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private generateId(sourceType: EmbeddingSourceType, sourceId: string): string {
    return `${sourceType}_${sourceId}`;
  }

  private hydrateEmbedding(data: Record<string, unknown>, id: string): StoredEmbedding {
    // Handle Firestore vector type
    let vector: number[] = [];
    if (data.vector) {
      if (Array.isArray(data.vector)) {
        vector = data.vector as number[];
      } else if (typeof (data.vector as { toArray?: () => number[] }).toArray === 'function') {
        vector = (data.vector as { toArray: () => number[] }).toArray();
      }
    }

    return {
      id,
      userId: data.userId as string,
      sourceType: data.sourceType as EmbeddingSourceType,
      sourceId: data.sourceId as string,
      vector,
      dimension: data.dimension as number,
      model: data.model as string,
      createdAt: data.createdAt instanceof Date
        ? data.createdAt
        : new Date((data.createdAt as { toDate?: () => Date })?.toDate?.() ?? Date.now()),
      expiresAt: data.expiresAt
        ? (data.expiresAt instanceof Date
            ? data.expiresAt
            : new Date((data.expiresAt as { toDate?: () => Date })?.toDate?.() ?? Date.now()))
        : undefined,
      metadata: data.metadata as Record<string, unknown> | undefined,
    };
  }

  private cosineDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) return 1;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return 1 - similarity; // Convert to distance
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: FirestoreEmbeddingStorage | null = null;

export function getEmbeddingStorage(config?: Partial<EmbeddingStorageConfig>): FirestoreEmbeddingStorage {
  if (!instance) {
    instance = new FirestoreEmbeddingStorage(config);
  }
  return instance;
}

export default FirestoreEmbeddingStorage;
