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
import { embed, embedBatch, cosineSimilarity } from './embeddings.js';
import type { VectorDocument, VectorSearchResult, VectorFilter } from './vector-store.js';

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

// ============================================================================
// FIRESTORE VECTOR STORE
// ============================================================================

export class FirestoreVectorStore {
  private db: FirestoreInstance | null = null;
  private config: FirestoreVectorConfig;
  private _initialized = false;
  private readonly COLLECTION_NAME: string;
  private readonly EMBEDDING_DIMENSION: number;

  // Fallback in-memory cache for when Firestore vector search isn't available
  private fallbackCache: Map<string, { doc: VectorDocument; embedding: number[] }> = new Map();
  private useFallback = false;

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
      getLogger().warn(
        'No Google Cloud credentials found. FirestoreVectorStore using in-memory fallback.'
      );
      this.useFallback = true;
      this._initialized = true;
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
        getLogger().warn(
          'Firestore vector search not available (SDK version too old or index not created). Using fallback mode.'
        );
        this.useFallback = true;
      }

      // Test connectivity with a simple read operation
      try {
        await testRef.limit(1).get();
      } catch (connError) {
        getLogger().warn(`Firestore connectivity test failed: ${connError}. Using fallback mode.`);
        this.useFallback = true;
        this.db = null;
      }

      this._initialized = true;
      getLogger().info(
        `FirestoreVectorStore initialized (collection: ${this.COLLECTION_NAME}, fallback: ${this.useFallback})`
      );
    } catch (error) {
      getLogger().error(`FirestoreVectorStore initialization failed: ${error}`);
      // Enable fallback mode
      this.useFallback = true;
      this._initialized = true;
      getLogger().warn('FirestoreVectorStore running in fallback (in-memory) mode');
    }
  }

  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Add a document to the vector store
   */
  async addDocument(doc: VectorDocument): Promise<void> {
    // Generate embedding if not provided
    let embedding = doc.embedding;
    if (!embedding) {
      try {
        embedding = await embed(doc.text);
      } catch (error) {
        getLogger().warn(`Failed to generate embedding for ${doc.id}: ${error}`);
        return;
      }
    }

    if (this.useFallback || !this.db) {
      // Fallback: store in memory
      this.fallbackCache.set(doc.id, { doc: { ...doc, embedding }, embedding });
      getLogger().debug(`Added document to fallback cache: ${doc.id}`);
      return;
    }

    try {
      const docRef = this.db.collection(this.COLLECTION_NAME).doc(doc.id);

      // Firestore vector format
      const { FieldValue } = await import('@google-cloud/firestore');

      await docRef.set({
        text: doc.text,
        embedding: FieldValue.vector(embedding),
        metadata: doc.metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      getLogger().debug(`Added document to Firestore vectors: ${doc.id}`);
    } catch (error) {
      getLogger().error(`Failed to add document ${doc.id}: ${error}`);
      // Fallback to memory
      this.fallbackCache.set(doc.id, { doc: { ...doc, embedding }, embedding });
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

      const embedding = (data.embedding as FieldVector)?.toArray?.() || data.embedding;

      return {
        id: snapshot.id,
        text: data.text as string,
        embedding: embedding as number[],
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
        const { FieldValue } = await import('@google-cloud/firestore');

        let searchQuery = collRef.findNearest({
          vectorField: 'embedding',
          queryVector: queryEmbedding,
          limit: topK * 2, // Get more to allow for filtering
          distanceMeasure: 'COSINE',
        });

        // Apply filters if provided
        if (options?.filter?.source) {
          const sources = Array.isArray(options.filter.source)
            ? options.filter.source
            : [options.filter.source];
          if (sources.length === 1) {
            searchQuery = searchQuery.where('metadata.source', '==', sources[0]);
          }
        }

        if (options?.filter?.userId) {
          searchQuery = searchQuery.where('metadata.userId', '==', options.filter.userId);
        }

        const snapshot = await searchQuery.get();

        const results: VectorSearchResult[] = [];
        for (const doc of snapshot.docs) {
          const data = doc.data();
          if (!data) continue;

          const docEmbedding = (data.embedding as FieldVector)?.toArray?.() || data.embedding;
          const score = cosineSimilarity(queryEmbedding, docEmbedding as number[]);

          if (score >= minScore) {
            results.push({
              document: {
                id: doc.id,
                text: data.text as string,
                embedding: docEmbedding as number[],
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
    minScore: number = 0
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

          const docEmbedding = (data.embedding as FieldVector)?.toArray?.() || data.embedding;
          const score = cosineSimilarity(queryEmbedding, docEmbedding as number[]);

          if (score >= minScore) {
            results.push({
              document: {
                id: doc.id,
                text: data.text as string,
                embedding: docEmbedding as number[],
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

      const snapshot = await query.limit(1000).get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (!data) continue;

        const embedding = (data.embedding as FieldVector)?.toArray?.() || data.embedding;

        results.push({
          id: doc.id,
          text: data.text as string,
          embedding: embedding as number[],
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
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.terminate();
      this.db = null;
    }
    this.fallbackCache.clear();
    this._initialized = false;
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
    defaultFirestoreVectorStore.close();
    defaultFirestoreVectorStore = null;
  }
}

export default FirestoreVectorStore;

