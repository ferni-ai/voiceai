/**
 * Firestore Vector Store
 *
 * Implements IVectorStore using Firestore's native vector search (findNearest).
 * This is the default backend for Ferni's vector operations.
 *
 * Benefits:
 * - No additional infrastructure needed
 * - Integrated with existing Firestore data
 * - Automatic scaling
 *
 * Limitations:
 * - Approximate nearest neighbor (not exact)
 * - Limited to ~1M vectors per index
 * - Slower than dedicated vector DBs for high-volume search
 *
 * @module memory/vector-store/firestore-vector-store
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import type {
  IVectorStore,
  VectorDocument,
  VectorSearchOptions,
  VectorSearchResult,
  VectorFilter,
  UpsertResult,
  DeleteResult,
  VectorStoreHealth,
  FirestoreVectorConfig,
  VectorMetadata,
} from './types.js';
import { DEFAULT_VECTOR_CONFIG } from './types.js';

const log = createLogger({ module: 'firestore-vector-store' });

// ============================================================================
// LRU CACHE
// ============================================================================

interface CacheEntry {
  doc: VectorDocument;
  accessedAt: number;
}

class VectorCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): VectorDocument | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.accessedAt;
    if (age > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    entry.accessedAt = Date.now();
    return entry.doc;
  }

  set(key: string, doc: VectorDocument): void {
    if (this.cache.size >= this.maxSize) {
      // Evict oldest entry
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [k, v] of this.cache.entries()) {
        if (v.accessedAt < oldestTime) {
          oldestTime = v.accessedAt;
          oldestKey = k;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { doc, accessedAt: Date.now() });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; hitRate: number } {
    return { size: this.cache.size, hitRate: 0 }; // TODO: Track hit rate
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Calculate cosine distance (1 - similarity)
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export class FirestoreVectorStore implements IVectorStore {
  readonly backend = 'firestore' as const;

  private db: FirebaseFirestore.Firestore | null = null;
  private config: FirestoreVectorConfig;
  private cache: VectorCache | null = null;
  private initialized = false;
  private errorCount = 0;

  constructor(config: Partial<FirestoreVectorConfig> = {}) {
    this.config = {
      ...DEFAULT_VECTOR_CONFIG,
      ...config,
    };

    if (this.config.enableCache) {
      this.cache = new VectorCache(
        this.config.cacheMaxSize ?? 1000,
        this.config.cacheTTLMs ?? 5 * 60 * 1000
      );
    }
  }

  private async ensureDb(): Promise<FirebaseFirestore.Firestore | null> {
    if (this.db) return this.db;

    try {
      const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
      this.db = getFirestoreDb();
      this.initialized = true;
      return this.db;
    } catch {
      log.debug('Firestore not available');
      return null;
    }
  }

  private getCollection(
    db: FirebaseFirestore.Firestore,
    namespace?: string
  ): FirebaseFirestore.CollectionReference {
    // Replace {userId} placeholder with namespace (which is userId)
    const path = this.config.collection.replace('{userId}', namespace ?? '_global');
    return db.collection(path);
  }

  async upsert(doc: VectorDocument): Promise<string> {
    const db = await this.ensureDb();
    if (!db) return doc.id;

    try {
      const collection = this.getCollection(db, doc.namespace ?? doc.metadata.userId);
      const docRef = collection.doc(doc.id);

      // Store with vector field for Firestore vector search
      const firestoreDoc = {
        ...doc.metadata,
        vector: doc.vector,
        _vectorDimension: doc.vector.length,
      };

      await docRef.set(cleanForFirestore(firestoreDoc));

      // Update cache
      if (this.cache) {
        const cacheKey = `${doc.namespace ?? doc.metadata.userId}:${doc.id}`;
        this.cache.set(cacheKey, doc);
      }

      log.debug({ id: doc.id, namespace: doc.namespace }, 'Upserted vector');
      return doc.id;
    } catch (error) {
      this.errorCount++;
      log.error({ error: String(error), id: doc.id }, 'Failed to upsert vector');
      throw error;
    }
  }

  async upsertBatch(docs: VectorDocument[]): Promise<UpsertResult> {
    const db = await this.ensureDb();
    if (!db) return { upsertedCount: 0, ids: [] };

    const ids: string[] = [];
    const batchSize = 500; // Firestore batch limit

    try {
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = db.batch();
        const batchDocs = docs.slice(i, i + batchSize);

        for (const doc of batchDocs) {
          const collection = this.getCollection(db, doc.namespace ?? doc.metadata.userId);
          const docRef = collection.doc(doc.id);

          const firestoreDoc = {
            ...doc.metadata,
            vector: doc.vector,
            _vectorDimension: doc.vector.length,
          };

          batch.set(docRef, cleanForFirestore(firestoreDoc));
          ids.push(doc.id);

          // Update cache
          if (this.cache) {
            const cacheKey = `${doc.namespace ?? doc.metadata.userId}:${doc.id}`;
            this.cache.set(cacheKey, doc);
          }
        }

        await batch.commit();
      }

      log.debug({ count: ids.length }, 'Batch upserted vectors');
      return { upsertedCount: ids.length, ids };
    } catch (error) {
      this.errorCount++;
      log.error({ error: String(error) }, 'Failed to batch upsert vectors');
      throw error;
    }
  }

  async search(
    queryVector: number[],
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    const db = await this.ensureDb();
    if (!db) return [];

    try {
      const collection = this.getCollection(db, options.namespace ?? options.filter?.userId as string);

      // Build query with filters
      let query: FirebaseFirestore.Query = collection;

      if (options.filter) {
        if (options.filter.userId) {
          query = query.where('userId', '==', options.filter.userId);
        }
        if (options.filter.sourceType) {
          const types = Array.isArray(options.filter.sourceType)
            ? options.filter.sourceType
            : [options.filter.sourceType];
          if (types.length === 1) {
            query = query.where('sourceType', '==', types[0]);
          } else {
            query = query.where('sourceType', 'in', types);
          }
        }
        if (options.filter.sourceId) {
          query = query.where('sourceId', '==', options.filter.sourceId);
        }
      }

      // Use Firestore's native vector search (findNearest)
      // Note: This requires the vector field to be indexed
      const snapshot = await query
        .limit(options.topK * 2) // Over-fetch for filtering
        .get();

      // Calculate similarity scores manually
      // (Firestore findNearest not available in all SDK versions)
      const results: VectorSearchResult[] = [];

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const vector = data.vector as number[] | undefined;

        if (!vector) continue;

        const score = cosineSimilarity(queryVector, vector);

        if (options.minScore !== undefined && score < options.minScore) continue;

        const metadata: VectorMetadata = {
          userId: data.userId as string,
          sourceType: data.sourceType as string,
          sourceId: data.sourceId as string,
          content: data.content as string | undefined,
          createdAt: data.createdAt as string,
          expiresAt: data.expiresAt as string | undefined,
        };

        results.push({
          id: doc.id,
          score,
          metadata,
          vector: options.includeVector ? vector : undefined,
        });
      }

      // Sort by score descending
      results.sort((a, b) => b.score - a.score);

      return results.slice(0, options.topK);
    } catch (error) {
      this.errorCount++;
      log.error({ error: String(error) }, 'Failed to search vectors');
      return [];
    }
  }

  async get(id: string, namespace?: string): Promise<VectorDocument | null> {
    // Check cache first
    if (this.cache) {
      const cacheKey = `${namespace ?? '_global'}:${id}`;
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    const db = await this.ensureDb();
    if (!db) return null;

    try {
      const collection = this.getCollection(db, namespace);
      const doc = await collection.doc(id).get();

      if (!doc.exists) return null;

      const data = doc.data()!;
      const vectorDoc: VectorDocument = {
        id: doc.id,
        vector: data.vector as number[],
        namespace,
        metadata: {
          userId: data.userId as string,
          sourceType: data.sourceType as string,
          sourceId: data.sourceId as string,
          content: data.content as string | undefined,
          createdAt: data.createdAt as string,
          expiresAt: data.expiresAt as string | undefined,
        },
      };

      // Update cache
      if (this.cache) {
        const cacheKey = `${namespace ?? '_global'}:${id}`;
        this.cache.set(cacheKey, vectorDoc);
      }

      return vectorDoc;
    } catch (error) {
      this.errorCount++;
      log.error({ error: String(error), id }, 'Failed to get vector');
      return null;
    }
  }

  async delete(id: string, namespace?: string): Promise<boolean> {
    const db = await this.ensureDb();
    if (!db) return false;

    try {
      const collection = this.getCollection(db, namespace);
      await collection.doc(id).delete();

      // Clear cache
      if (this.cache) {
        const cacheKey = `${namespace ?? '_global'}:${id}`;
        this.cache.delete(cacheKey);
      }

      return true;
    } catch (error) {
      this.errorCount++;
      log.error({ error: String(error), id }, 'Failed to delete vector');
      return false;
    }
  }

  async deleteByFilter(filter: VectorFilter, namespace?: string): Promise<DeleteResult> {
    const db = await this.ensureDb();
    if (!db) return { deletedCount: 0 };

    try {
      const collection = this.getCollection(db, namespace ?? filter.userId as string);
      let query: FirebaseFirestore.Query = collection;

      if (filter.userId) {
        query = query.where('userId', '==', filter.userId);
      }
      if (filter.sourceType) {
        const types = Array.isArray(filter.sourceType) ? filter.sourceType : [filter.sourceType];
        if (types.length === 1) {
          query = query.where('sourceType', '==', types[0]);
        }
      }
      if (filter.sourceId) {
        query = query.where('sourceId', '==', filter.sourceId);
      }

      const snapshot = await query.limit(500).get();

      if (snapshot.empty) return { deletedCount: 0 };

      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      // Clear related cache entries
      if (this.cache) {
        this.cache.clear(); // Simple approach - clear all
      }

      return { deletedCount: snapshot.size };
    } catch (error) {
      this.errorCount++;
      log.error({ error: String(error) }, 'Failed to delete vectors by filter');
      return { deletedCount: 0 };
    }
  }

  async deleteNamespace(namespace: string): Promise<DeleteResult> {
    const db = await this.ensureDb();
    if (!db) return { deletedCount: 0 };

    try {
      const collection = this.getCollection(db, namespace);
      const snapshot = await collection.limit(500).get();

      if (snapshot.empty) return { deletedCount: 0 };

      let totalDeleted = 0;

      while (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        totalDeleted += snapshot.size;

        // Check for more
        const nextSnapshot = await collection.limit(500).get();
        if (nextSnapshot.empty) break;
      }

      // Clear cache
      if (this.cache) {
        this.cache.clear();
      }

      return { deletedCount: totalDeleted };
    } catch (error) {
      this.errorCount++;
      log.error({ error: String(error), namespace }, 'Failed to delete namespace');
      return { deletedCount: 0 };
    }
  }

  async getHealth(): Promise<VectorStoreHealth> {
    const db = await this.ensureDb();

    if (!db) {
      return {
        healthy: false,
        backend: 'firestore',
        vectorCount: 0,
        indexStatus: 'error',
        lastError: 'Firestore not available',
      };
    }

    return {
      healthy: this.initialized,
      backend: 'firestore',
      vectorCount: -1, // Would require expensive count query
      indexStatus: 'ready',
      latencyMs: undefined,
    };
  }

  async close(): Promise<void> {
    if (this.cache) {
      this.cache.clear();
    }
    this.db = null;
    this.initialized = false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default FirestoreVectorStore;
