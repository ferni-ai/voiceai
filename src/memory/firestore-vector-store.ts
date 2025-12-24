/**
 * Firestore Vector Store
 *
 * Production-grade persistent vector storage using Google Cloud Firestore's
 * native vector search capabilities. Replaces the ephemeral in-memory VectorStore.
 *
 * Features:
 * - Persistent vector storage (survives restarts)
 * - Native KNN similarity search
 * - Automatic embedding generation
 * - User-scoped and global document support
 * - Seamless integration with existing Firestore store
 *
 * Requires:
 * - @google-cloud/firestore >= 7.1.0 (for vector search)
 * - A Firestore vector index (created via gcloud or Firebase console)
 *
 * Index Creation (run once):
 * ```
 * gcloud firestore indexes composite create \
 *   --collection-group=vectors \
 *   --query-scope=COLLECTION \
 *   --field-config=vector-config='{"dimension":"768","flat":{}}',field-path=embedding
 * ```
 */

import { getLogger } from '../utils/safe-logger.js';
import { removeUndefined } from '../utils/firestore-utils.js';
import { cosineSimilarity, embed, embedBatch } from './embeddings.js';
import type {
  VectorStoreContract,
  VectorDocument,
  VectorFilter,
  VectorSearchResult,
} from './vector-store-interface.js';

// ============================================================================
// TYPES
// ============================================================================

interface FirestoreVectorConfig {
  projectId?: string;
  databaseId?: string;
  collectionName?: string;
  embeddingDimension?: number;
}

interface FirestoreInstance {
  collection: (path: string) => CollectionReference;
  terminate: () => Promise<void>;
}

interface CollectionReference {
  doc: (id: string) => DocumentReference;
  where: (field: string, op: string, value: unknown) => Query;
  limit: (n: number) => Query;
  get: () => Promise<QuerySnapshot>;
  findNearest?: (options: FindNearestOptions) => Query;
}

interface FindNearestOptions {
  vectorField: string;
  queryVector: number[];
  limit: number;
  distanceMeasure: 'EUCLIDEAN' | 'COSINE' | 'DOT_PRODUCT';
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
  ref?: DocumentReference;
}

interface QuerySnapshot {
  empty: boolean;
  docs: DocumentSnapshot[];
  size: number;
}

interface Query {
  where: (field: string, op: string, value: unknown) => Query;
  limit: (n: number) => Query;
  get: () => Promise<QuerySnapshot>;
}

// Firestore vector type
interface FieldVector {
  toArray: () => number[];
}

/**
 * FIX: Helper to safely extract embedding array with validation
 * Returns undefined if embedding is invalid or wrong dimension
 */
function extractEmbedding(
  rawEmbedding: unknown,
  expectedDimension: number,
  docId: string
): number[] | undefined {
  let embedding: number[] | undefined;

  // Handle Firestore FieldVector type
  if (rawEmbedding && typeof rawEmbedding === 'object' && 'toArray' in rawEmbedding) {
    embedding = (rawEmbedding as FieldVector).toArray();
  }
  // Handle raw number array
  else if (Array.isArray(rawEmbedding)) {
    embedding = rawEmbedding;
  }

  // Validate the embedding
  if (!embedding || !Array.isArray(embedding)) {
    getLogger().warn({ docId }, 'Document has no valid embedding');
    return undefined;
  }

  // FIX: Validate dimension to catch data corruption
  if (embedding.length !== expectedDimension) {
    getLogger().warn(
      { docId, expected: expectedDimension, actual: embedding.length },
      'Embedding dimension mismatch - possible data corruption'
    );
    // Still return it but log the warning - caller can decide what to do
  }

  // Validate all elements are numbers
  if (!embedding.every((n) => typeof n === 'number' && !isNaN(n))) {
    getLogger().warn({ docId }, 'Embedding contains non-numeric values');
    return undefined;
  }

  return embedding;
}

// ============================================================================
// FIRESTORE VECTOR STORE
// ============================================================================

export class FirestoreVectorStore implements VectorStoreContract {
  private db: FirestoreInstance | null = null;
  private config: FirestoreVectorConfig;
  private _initialized = false;
  private readonly COLLECTION_NAME: string;
  private readonly EMBEDDING_DIMENSION: number;

  // Fallback in-memory cache for when Firestore vector search isn't available
  private fallbackCache = new Map<string, { doc: VectorDocument; embedding: number[] }>();
  private useFallback = false;

  // FIX AUDIT ISSUE: Track health status and recovery attempts
  private fallbackReason: string | null = null;
  private lastRecoveryAttempt = 0;
  private recoveryAttemptCount = 0;
  private readonly RECOVERY_INTERVAL_MS = 60_000; // Try recovery every 60s
  private readonly MAX_RECOVERY_ATTEMPTS = 10;
  private recoveryTimer: ReturnType<typeof setInterval> | null = null;

  // FIX AUDIT ISSUE: Limit fallback cache size to prevent unbounded memory growth
  // 768-dim floats × 10,000 docs ≈ 30MB max memory usage
  private readonly MAX_FALLBACK_CACHE_SIZE = 10_000;

  constructor(config?: FirestoreVectorConfig) {
    this.config = {
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
      collectionName: 'vectors',
      embeddingDimension: 768, // Google's text-embedding-004
      ...config,
    };
    this.COLLECTION_NAME = this.config.collectionName || 'vectors';
    this.EMBEDDING_DIMENSION = this.config.embeddingDimension || 768;
  }

  /**
   * Initialize the Firestore connection
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    // Check for credentials early to avoid unhandled rejections
    const hasCredentials =
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.GCLOUD_SERVICE_KEY ||
      // In Cloud Run/GCE, credentials are available via metadata server
      process.env.K_SERVICE ||
      process.env.GCE_METADATA_HOST;

    if (!hasCredentials && process.env.NODE_ENV !== 'production') {
      this.useFallback = true;
      this.fallbackReason = 'No Google Cloud credentials found';
      this._initialized = true;

      // FIX AUDIT ISSUE: Emit structured warning with risk assessment
      getLogger().warn(
        {
          reason: this.fallbackReason,
          risk: 'DATA_LOSS_ON_RESTART',
          mode: 'in-memory',
          recommendation: 'Set GOOGLE_APPLICATION_CREDENTIALS or deploy to GCP',
        },
        '⚠️ CRITICAL: Vector store running in fallback mode - memory data is EPHEMERAL!'
      );

      // Schedule recovery attempts in production-like environments
      if (process.env.NODE_ENV === 'staging') {
        this.scheduleRecoveryAttempt();
      }
      return;
    }

    try {
      const { Firestore } = await import('@google-cloud/firestore');

      this.db = new Firestore({
        projectId: this.config.projectId,
        databaseId: this.config.databaseId,
      }) as unknown as FirestoreInstance;

      // Test if vector search is available by checking collection
      const testRef = this.db.collection(this.COLLECTION_NAME);
      if (!testRef.findNearest) {
        this.useFallback = true;
        this.fallbackReason = 'Firestore SDK too old or vector index not created';

        // FIX AUDIT ISSUE: Structured warning
        getLogger().warn(
          {
            reason: this.fallbackReason,
            risk: 'DATA_LOSS_ON_RESTART',
            mode: 'in-memory',
            recommendation: 'Upgrade @google-cloud/firestore to >= 7.1.0 and create vector index',
          },
          '⚠️ CRITICAL: Vector store running in fallback mode - findNearest unavailable!'
        );
      }

      // Test connectivity with a simple read operation
      try {
        await testRef.limit(1).get();
      } catch (connError) {
        this.useFallback = true;
        this.fallbackReason = `Firestore connectivity failed: ${connError}`;
        this.db = null;

        // FIX AUDIT ISSUE: Structured warning
        getLogger().warn(
          {
            reason: this.fallbackReason,
            error: String(connError),
            risk: 'DATA_LOSS_ON_RESTART',
            mode: 'in-memory',
          },
          '⚠️ CRITICAL: Vector store running in fallback mode - connectivity failed!'
        );
      }

      this._initialized = true;

      // Log final initialization state
      if (this.useFallback) {
        // Schedule recovery attempts
        this.scheduleRecoveryAttempt();
      } else {
        getLogger().info(
          {
            collection: this.COLLECTION_NAME,
            healthy: true,
          },
          '✅ FirestoreVectorStore initialized successfully with Firestore backend'
        );

        // FIX: Log index reminder for operators
        getLogger().info(
          {
            collection: this.COLLECTION_NAME,
            dimension: this.EMBEDDING_DIMENSION,
            indexCommand: `gcloud firestore indexes composite create --collection-group=${this.COLLECTION_NAME} --query-scope=COLLECTION --field-config=vector-config='{"dimension":"${this.EMBEDDING_DIMENSION}","flat":{}}',field-path=embedding`,
          },
          '📋 Ensure vector index exists for optimal search performance'
        );
      }
    } catch (error) {
      // FIX AUDIT ISSUE: Structured error logging with risk
      this.useFallback = true;
      this.fallbackReason = `Initialization error: ${error}`;
      this._initialized = true;

      getLogger().error(
        {
          error: String(error),
          reason: this.fallbackReason,
          risk: 'DATA_LOSS_ON_RESTART',
          mode: 'in-memory',
        },
        '❌ CRITICAL: FirestoreVectorStore initialization failed - running in fallback mode!'
      );

      // Schedule recovery
      this.scheduleRecoveryAttempt();
    }
  }

  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * FIX AUDIT ISSUE: Health check method for monitoring and alerting
   * Returns comprehensive health status including fallback state
   */
  getHealth(): {
    healthy: boolean;
    initialized: boolean;
    usingFallback: boolean;
    fallbackReason: string | null;
    risk: 'none' | 'data_loss' | 'degraded_search';
    recoveryAttempts: number;
    lastRecoveryAttempt: number | null;
    cacheSize: number;
  } {
    return {
      healthy: this._initialized && !this.useFallback,
      initialized: this._initialized,
      usingFallback: this.useFallback,
      fallbackReason: this.fallbackReason,
      risk: this.useFallback ? 'data_loss' : 'none',
      recoveryAttempts: this.recoveryAttemptCount,
      lastRecoveryAttempt: this.lastRecoveryAttempt || null,
      cacheSize: this.fallbackCache.size,
    };
  }

  /**
   * FIX AUDIT ISSUE: Add to fallback cache with size limit enforcement
   * Uses LRU-style eviction when cache is full
   */
  private addToFallbackCache(id: string, doc: VectorDocument, embedding: number[]): void {
    // Evict oldest entries if at capacity
    if (this.fallbackCache.size >= this.MAX_FALLBACK_CACHE_SIZE) {
      // Remove oldest entries (first 10% of cache)
      const toEvict = Math.ceil(this.MAX_FALLBACK_CACHE_SIZE * 0.1);
      let evicted = 0;
      for (const key of this.fallbackCache.keys()) {
        if (evicted >= toEvict) break;
        this.fallbackCache.delete(key);
        evicted++;
      }
      getLogger().warn(
        { evicted, remaining: this.fallbackCache.size },
        'Evicted entries from fallback cache due to size limit'
      );
    }

    this.fallbackCache.set(id, { doc: { ...doc, embedding }, embedding });
  }

  /**
   * FIX AUDIT ISSUE: Schedule periodic recovery attempts when in fallback mode
   * FIX: Improved error handling to prevent timer leaks
   */
  private scheduleRecoveryAttempt(): void {
    // Don't schedule if already scheduled or max attempts reached
    if (this.recoveryTimer || this.recoveryAttemptCount >= this.MAX_RECOVERY_ATTEMPTS) {
      return;
    }

    this.recoveryTimer = setInterval(() => {
      // FIX: Wrap entire async operation in try-catch to prevent unhandled rejections
      this.attemptRecovery().catch((error) => {
        getLogger().error({ error: String(error) }, 'Unhandled error in recovery attempt');
        // FIX: Ensure timer is cleaned up even on unexpected errors
        this.cleanupRecoveryTimer();
      });
    }, this.RECOVERY_INTERVAL_MS);
  }

  /**
   * FIX: Separated recovery logic for better error handling and testability
   */
  private async attemptRecovery(): Promise<void> {
    if (!this.useFallback) {
      // Recovery already succeeded, stop the timer
      this.cleanupRecoveryTimer();
      return;
    }

    this.recoveryAttemptCount++;
    this.lastRecoveryAttempt = Date.now();

    getLogger().info(
      {
        attempt: this.recoveryAttemptCount,
        maxAttempts: this.MAX_RECOVERY_ATTEMPTS,
        cacheSize: this.fallbackCache.size,
      },
      '🔄 Attempting Firestore vector store recovery...'
    );

    try {
      // Reset state and try to reinitialize
      this._initialized = false;
      this.useFallback = false;
      this.fallbackReason = null;
      this.db = null;

      await this.initialize();

      if (!this.useFallback) {
        getLogger().info(
          {
            attempt: this.recoveryAttemptCount,
            cacheSize: this.fallbackCache.size,
          },
          '✅ Firestore vector store recovered successfully!'
        );

        // Migrate cached data to Firestore
        if (this.fallbackCache.size > 0) {
          await this.migrateCacheToFirestore();
        }

        // Stop recovery timer
        this.cleanupRecoveryTimer();
      }
    } catch (error) {
      getLogger().warn(
        { error: String(error), attempt: this.recoveryAttemptCount },
        'Recovery attempt failed'
      );
    }

    // Stop after max attempts
    if (this.recoveryAttemptCount >= this.MAX_RECOVERY_ATTEMPTS) {
      getLogger().error(
        {
          attempts: this.recoveryAttemptCount,
          cacheSize: this.fallbackCache.size,
          risk: 'DATA_LOSS_ON_RESTART',
        },
        '❌ Max recovery attempts reached. Vector store stuck in fallback mode. MANUAL INTERVENTION REQUIRED!'
      );
      this.cleanupRecoveryTimer();
    }
  }

  /**
   * FIX: Helper to clean up recovery timer safely
   */
  private cleanupRecoveryTimer(): void {
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }

  /**
   * Migrate cached data to Firestore after recovery
   * FIX: Now uses batch writes to respect Firestore's 500-operation limit
   */
  private async migrateCacheToFirestore(): Promise<void> {
    if (this.useFallback || !this.db || this.fallbackCache.size === 0) {
      return;
    }

    getLogger().info(
      { count: this.fallbackCache.size },
      '📤 Migrating cached vectors to Firestore...'
    );

    const { FieldValue, WriteBatch } = await import('@google-cloud/firestore');
    const entries = Array.from(this.fallbackCache.entries());
    let migrated = 0;
    let failed = 0;

    // FIX: Process in batches of 500 (Firestore's limit)
    const BATCH_SIZE = 500;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const chunk = entries.slice(i, i + BATCH_SIZE);
      const batch = (this.db as unknown as { batch: () => FirebaseFirestore.WriteBatch }).batch?.();

      // If batch API not available, fall back to individual writes
      if (!batch) {
        for (const [id, { doc }] of chunk) {
          try {
            const docRef = this.db!.collection(this.COLLECTION_NAME).doc(id);
            await docRef.set(
              removeUndefined({
                text: doc.text,
                embedding: FieldValue.vector(doc.embedding!),
                metadata: doc.metadata,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
            );
            this.fallbackCache.delete(id);
            migrated++;
          } catch (error) {
            failed++;
            getLogger().warn({ id, error: String(error) }, 'Failed to migrate document');
          }
        }
        continue;
      }

      // Use batch writes for efficiency
      const batchIds: string[] = [];
      for (const [id, { doc }] of chunk) {
        try {
          const docRef = this.db!.collection(this.COLLECTION_NAME).doc(id);
          (batch as unknown as FirebaseFirestore.WriteBatch).set(
            docRef as unknown as FirebaseFirestore.DocumentReference,
            removeUndefined({
              text: doc.text,
              embedding: FieldValue.vector(doc.embedding!),
              metadata: doc.metadata,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          );
          batchIds.push(id);
        } catch (error) {
          failed++;
          getLogger().warn({ id, error: String(error) }, 'Failed to add document to batch');
        }
      }

      // Commit the batch
      try {
        await (batch as unknown as FirebaseFirestore.WriteBatch).commit();
        // Remove successfully migrated docs from cache
        for (const id of batchIds) {
          this.fallbackCache.delete(id);
          migrated++;
        }
      } catch (error) {
        failed += batchIds.length;
        getLogger().error(
          { error: String(error), batchSize: batchIds.length },
          'Batch commit failed during migration'
        );
      }
    }

    getLogger().info(
      { migrated, failed, remaining: this.fallbackCache.size },
      '📥 Cache migration complete'
    );
  }

  /**
   * Ensure vector store is initialized before any operation.
   * Enables lazy initialization - connects on first use, not startup.
   */
  private async ensureInitialized(): Promise<void> {
    if (this._initialized) return;
    await this.initialize();
  }

  /**
   * Add a document to the vector store
   */
  async addDocument(doc: VectorDocument): Promise<void> {
    await this.ensureInitialized();

    // Generate embedding if not provided
    let { embedding } = doc;
    if (!embedding) {
      try {
        embedding = await embed(doc.text);
      } catch (error) {
        getLogger().warn(`Failed to generate embedding for ${doc.id}: ${error}`);
        return;
      }
    }

    if (this.useFallback || !this.db) {
      // Fallback: store in memory with size limit
      this.addToFallbackCache(doc.id, doc, embedding);
      getLogger().debug(`Added document to fallback cache: ${doc.id}`);
      return;
    }

    try {
      const docRef = this.db.collection(this.COLLECTION_NAME).doc(doc.id);

      // Firestore vector format
      const { FieldValue } = await import('@google-cloud/firestore');

      await docRef.set(
        removeUndefined({
          text: doc.text,
          embedding: FieldValue.vector(embedding),
          metadata: doc.metadata,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

      getLogger().debug(`Added document to Firestore vectors: ${doc.id}`);
    } catch (error) {
      getLogger().error(`Failed to add document ${doc.id}: ${error}`);
      // Fallback to memory with size limit
      this.addToFallbackCache(doc.id, doc, embedding);
    }
  }

  /**
   * Add multiple documents in batch
   */
  async addDocuments(docs: VectorDocument[]): Promise<void> {
    // Generate embeddings for docs that need them
    const needsEmbedding = docs.filter((d) => !d.embedding);
    const hasEmbedding = docs.filter((d) => d.embedding);

    if (needsEmbedding.length > 0) {
      try {
        const texts = needsEmbedding.map((d) => d.text);
        const embeddings = await embedBatch(texts);
        for (let i = 0; i < needsEmbedding.length; i++) {
          needsEmbedding[i].embedding = embeddings[i];
        }
      } catch (error) {
        getLogger().warn(`Batch embedding failed: ${error}`);
        return;
      }
    }

    // Add all documents
    const allDocs = [...needsEmbedding, ...hasEmbedding];
    for (const doc of allDocs) {
      await this.addDocument(doc);
    }

    getLogger().info(`Added ${allDocs.length} documents to vector store`);
  }

  /**
   * Remove a document from the store
   */
  async removeDocument(id: string): Promise<boolean> {
    this.fallbackCache.delete(id);

    if (this.useFallback || !this.db) {
      return true;
    }

    try {
      const docRef = this.db.collection(this.COLLECTION_NAME).doc(id);
      await docRef.delete();
      return true;
    } catch (error) {
      getLogger().error(`Failed to remove document ${id}: ${error}`);
      return false;
    }
  }

  /**
   * Get a document by ID
   */
  async getDocument(id: string): Promise<VectorDocument | undefined> {
    // Check fallback cache first
    const cached = this.fallbackCache.get(id);
    if (cached) return cached.doc;

    if (this.useFallback || !this.db) {
      return undefined;
    }

    try {
      const docRef = this.db.collection(this.COLLECTION_NAME).doc(id);
      const snapshot = await docRef.get();

      if (!snapshot.exists) return undefined;

      const data = snapshot.data();
      if (!data) return undefined;

      // FIX: Use validated embedding extraction
      const embedding = extractEmbedding(data.embedding, this.EMBEDDING_DIMENSION, snapshot.id);
      if (!embedding) {
        return undefined;
      }

      return {
        id: snapshot.id,
        text: data.text as string,
        embedding,
        metadata: data.metadata as VectorDocument['metadata'],
      };
    } catch (error) {
      getLogger().error(`Failed to get document ${id}: ${error}`);
      return undefined;
    }
  }

  /**
   * Semantic search for similar documents using Firestore's native vector search
   */
  async search(
    query: string,
    options?: {
      topK?: number;
      filter?: VectorFilter;
      minScore?: number;
    }
  ): Promise<VectorSearchResult[]> {
    await this.ensureInitialized();

    const topK = options?.topK || 5;
    const minScore = options?.minScore || 0;

    // Generate query embedding
    let queryEmbedding: number[];
    try {
      queryEmbedding = await embed(query);
    } catch (error) {
      getLogger().warn(`Failed to generate query embedding: ${error}`);
      return [];
    }

    // Use fallback if needed
    if (this.useFallback || !this.db) {
      return this.searchFallback(queryEmbedding, topK, options?.filter, minScore);
    }

    try {
      const collRef = this.db.collection(this.COLLECTION_NAME);

      // Use Firestore's native findNearest for vector search
      if (collRef.findNearest) {
        // IMPORTANT: VectorQuery from findNearest() does NOT support .where() chaining
        // Filters must be applied BEFORE findNearest() using a pre-filtered collection query
        // See: https://cloud.google.com/firestore/docs/vector-search
        //
        // WORKAROUND: Apply filters to base query first, then call findNearest
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let baseQuery: any = collRef;

        // Apply filters BEFORE findNearest (VectorQuery doesn't support .where())
        if (options?.filter?.source) {
          const sources = Array.isArray(options.filter.source)
            ? options.filter.source
            : [options.filter.source];
          if (sources.length === 1) {
            baseQuery = baseQuery.where('metadata.source', '==', sources[0]);
          }
        }

        if (options?.filter?.userId) {
          baseQuery = baseQuery.where('metadata.userId', '==', options.filter.userId);
        }

        // Now apply findNearest to the filtered query
        const searchQuery = baseQuery.findNearest({
          vectorField: 'embedding',
          queryVector: queryEmbedding,
          limit: topK * 2, // Get more to allow for filtering
          distanceMeasure: 'COSINE',
        });

        const snapshot = await searchQuery.get();

        const results: VectorSearchResult[] = [];
        for (const doc of snapshot.docs) {
          const data = doc.data();
          if (!data) continue;

          // FIX: Use validated embedding extraction
          const docEmbedding = extractEmbedding(data.embedding, this.EMBEDDING_DIMENSION, doc.id);
          if (!docEmbedding) continue;

          const score = cosineSimilarity(queryEmbedding, docEmbedding);

          if (score >= minScore) {
            results.push({
              document: {
                id: doc.id,
                text: data.text as string,
                embedding: docEmbedding,
                metadata: data.metadata as VectorDocument['metadata'],
              },
              score,
            });
          }
        }

        return results.sort((a, b) => b.score - a.score).slice(0, topK);
      }
    } catch (error) {
      getLogger().warn(`Firestore vector search failed, using fallback: ${error}`);
    }

    // Fallback to in-memory search
    return this.searchFallback(queryEmbedding, topK, options?.filter, minScore);
  }

  /**
   * Fallback search using in-memory cosine similarity
   */
  private searchFallback(
    queryEmbedding: number[],
    topK: number,
    filter?: VectorFilter,
    minScore = 0
  ): VectorSearchResult[] {
    const results: VectorSearchResult[] = [];

    for (const { doc, embedding } of this.fallbackCache.values()) {
      // Apply filters
      if (filter) {
        if (filter.source) {
          const sources = Array.isArray(filter.source) ? filter.source : [filter.source];
          if (!sources.includes(doc.metadata.source)) continue;
        }
        if (filter.userId && doc.metadata.userId !== filter.userId) continue;
        if (filter.category) {
          const categories = Array.isArray(filter.category) ? filter.category : [filter.category];
          if (!doc.metadata.category || !categories.includes(doc.metadata.category)) continue;
        }
      }

      const score = cosineSimilarity(queryEmbedding, embedding);
      if (score >= minScore) {
        results.push({ document: doc, score });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * Search by embedding directly (for pre-computed queries)
   */
  async searchByEmbedding(
    queryEmbedding: number[],
    options?: {
      topK?: number;
      filter?: VectorFilter;
      minScore?: number;
    }
  ): Promise<VectorSearchResult[]> {
    const topK = options?.topK || 5;
    const minScore = options?.minScore || 0;

    if (this.useFallback || !this.db) {
      return this.searchFallback(queryEmbedding, topK, options?.filter, minScore);
    }

    try {
      const collRef = this.db.collection(this.COLLECTION_NAME);

      if (collRef.findNearest) {
        const searchQuery = collRef.findNearest({
          vectorField: 'embedding',
          queryVector: queryEmbedding,
          limit: topK,
          distanceMeasure: 'COSINE',
        });

        const snapshot = await searchQuery.get();

        const results: VectorSearchResult[] = [];
        for (const doc of snapshot.docs) {
          const data = doc.data();
          if (!data) continue;

          // FIX: Use validated embedding extraction
          const docEmbedding = extractEmbedding(data.embedding, this.EMBEDDING_DIMENSION, doc.id);
          if (!docEmbedding) continue;

          const score = cosineSimilarity(queryEmbedding, docEmbedding);

          if (score >= minScore) {
            results.push({
              document: {
                id: doc.id,
                text: data.text as string,
                embedding: docEmbedding,
                metadata: data.metadata as VectorDocument['metadata'],
              },
              score,
            });
          }
        }

        return results;
      }
    } catch (error) {
      getLogger().warn(`searchByEmbedding failed: ${error}`);
    }

    return this.searchFallback(queryEmbedding, topK, options?.filter, minScore);
  }

  /**
   * Get all documents matching a filter
   * FIX: Added pagination warning and validated embedding extraction
   */
  async list(filter?: VectorFilter): Promise<VectorDocument[]> {
    const results: VectorDocument[] = [];

    // Include fallback cache
    for (const { doc } of this.fallbackCache.values()) {
      if (this.matchesFilter(doc, filter)) {
        results.push(doc);
      }
    }

    if (this.useFallback || !this.db) {
      return results;
    }

    try {
      let query: Query | CollectionReference = this.db.collection(this.COLLECTION_NAME);

      // Apply filters
      if (filter?.source) {
        const sources = Array.isArray(filter.source) ? filter.source : [filter.source];
        if (sources.length === 1) {
          query = query.where('metadata.source', '==', sources[0]);
        }
      }

      if (filter?.userId) {
        query = query.where('metadata.userId', '==', filter.userId);
      }

      // FIX: Use a more reasonable limit and warn if truncated
      const PAGE_SIZE = 500;
      const snapshot = await query.limit(PAGE_SIZE).get();

      // FIX: Warn if result set may be truncated
      if (snapshot.size === PAGE_SIZE) {
        getLogger().warn(
          { limit: PAGE_SIZE, filter },
          'list() result may be truncated - consider using pagination'
        );
      }

      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (!data) continue;

        // FIX: Use validated embedding extraction
        const embedding = extractEmbedding(data.embedding, this.EMBEDDING_DIMENSION, doc.id);
        if (!embedding) continue;

        results.push({
          id: doc.id,
          text: data.text as string,
          embedding,
          metadata: data.metadata as VectorDocument['metadata'],
        });
      }
    } catch (error) {
      getLogger().error(`list failed: ${error}`);
    }

    return results;
  }

  /**
   * Check if filter matches document
   */
  private matchesFilter(doc: VectorDocument, filter?: VectorFilter): boolean {
    if (!filter) return true;

    if (filter.source) {
      const sources = Array.isArray(filter.source) ? filter.source : [filter.source];
      if (!sources.includes(doc.metadata.source)) return false;
    }

    if (filter.category) {
      const categories = Array.isArray(filter.category) ? filter.category : [filter.category];
      if (!doc.metadata.category || !categories.includes(doc.metadata.category)) return false;
    }

    if (filter.userId && doc.metadata.userId !== filter.userId) return false;

    return true;
  }

  /**
   * Get store statistics
   */
  async getStats(): Promise<{
    documentCount: number;
    bySource: Record<string, number>;
    byCategory: Record<string, number>;
    usingFallback: boolean;
  }> {
    const bySource: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    let documentCount = 0;

    // Count fallback cache
    for (const { doc } of this.fallbackCache.values()) {
      documentCount++;
      bySource[doc.metadata.source] = (bySource[doc.metadata.source] || 0) + 1;
      if (doc.metadata.category) {
        byCategory[doc.metadata.category] = (byCategory[doc.metadata.category] || 0) + 1;
      }
    }

    if (!this.useFallback && this.db) {
      try {
        const snapshot = await this.db.collection(this.COLLECTION_NAME).get();
        for (const doc of snapshot.docs) {
          const data = doc.data();
          if (!data?.metadata) continue;

          documentCount++;
          const meta = data.metadata as VectorDocument['metadata'];
          bySource[meta.source] = (bySource[meta.source] || 0) + 1;
          if (meta.category) {
            byCategory[meta.category] = (byCategory[meta.category] || 0) + 1;
          }
        }
      } catch (error) {
        getLogger().warn(`getStats failed: ${error}`);
      }
    }

    return {
      documentCount,
      bySource,
      byCategory,
      usingFallback: this.useFallback,
    };
  }

  /**
   * Clear all documents (use with caution!)
   */
  async clear(): Promise<void> {
    this.fallbackCache.clear();

    if (this.useFallback || !this.db) return;

    try {
      const snapshot = await this.db.collection(this.COLLECTION_NAME).get();
      for (const doc of snapshot.docs) {
        await doc.ref?.delete?.();
      }
      getLogger().info('Cleared all vectors from Firestore');
    } catch (error) {
      getLogger().error(`clear failed: ${error}`);
    }
  }

  /**
   * Close the connection
   * FIX: Uses helper for timer cleanup
   */
  async close(): Promise<void> {
    // FIX: Use helper for consistent cleanup
    this.cleanupRecoveryTimer();

    if (this.db) {
      await this.db.terminate();
      this.db = null;
    }
    this.fallbackCache.clear();
    this._initialized = false;
    this.useFallback = false;
    this.fallbackReason = null;
    this.recoveryAttemptCount = 0;
    this.lastRecoveryAttempt = 0;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let defaultFirestoreVectorStore: FirestoreVectorStore | null = null;

/**
 * Get the default Firestore vector store instance
 */
export function getFirestoreVectorStore(): FirestoreVectorStore {
  if (!defaultFirestoreVectorStore) {
    defaultFirestoreVectorStore = new FirestoreVectorStore();
  }
  return defaultFirestoreVectorStore;
}

/**
 * Reset the default store (for testing)
 */
export function resetFirestoreVectorStore(): void {
  if (defaultFirestoreVectorStore) {
    void defaultFirestoreVectorStore.close();
    defaultFirestoreVectorStore = null;
  }
}

export default FirestoreVectorStore;
