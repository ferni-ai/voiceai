/**
 * Vector Adapter for Unified Memory Store
 *
 * Wraps the existing Firestore Vector Store to provide semantic search capabilities.
 * Handles embedding storage and similarity search.
 *
 * @module memory/unified-store/adapters/vector-adapter
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { embed } from '../../embeddings.js';
import type {
  VectorStoreAdapter,
  StoredMemory,
  SearchParams,
  ScoredMemory,
  StoreHealth,
  MemoryType,
} from '../types.js';

const log = createLogger({ module: 'VectorAdapter' });

// ============================================================================
// TYPES
// ============================================================================

interface VectorDocument {
  id: string;
  text: string;
  embedding?: number[];
  metadata: Record<string, unknown>;
}

interface VectorSearchOptions {
  topK?: number;
  minScore?: number;
  filter?: Record<string, unknown>;
}

interface VectorSearchResult {
  document: VectorDocument;
  score: number;
}

interface VectorStoreInstance {
  initialize(): Promise<void>;
  addDocument(doc: VectorDocument): Promise<void>;
  addDocuments(docs: VectorDocument[]): Promise<void>;
  search(query: string, options?: VectorSearchOptions): Promise<VectorSearchResult[]>;
  searchByEmbedding?(
    embedding: number[],
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult[]>;
  deleteDocument(id: string): Promise<void>;
  getHealth?(): { healthy: boolean; initialized: boolean; usingFallback: boolean };
}

interface VectorAdapterConfig {
  projectId?: string;
  databaseId?: string;
  collectionName?: string;
  embeddingDimension?: number;
}

// ============================================================================
// VECTOR ADAPTER
// ============================================================================

/**
 * Vector adapter for semantic search in the unified memory store
 *
 * Provides embedding storage and similarity search using Firestore's
 * native vector capabilities.
 */
export class VectorAdapter implements VectorStoreAdapter {
  readonly name = 'vector';

  private vectorStore: VectorStoreInstance | null = null;
  private config: VectorAdapterConfig;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  // Metrics
  private successCount = 0;
  private errorCount = 0;
  private lastError: string | undefined;
  private lastSuccess: Date | undefined;
  private avgLatencyMs = 0;
  private latencyCount = 0;

  private readonly VECTOR_COLLECTION = 'memory_vectors';

  constructor(config?: VectorAdapterConfig) {
    this.config = {
      projectId: config?.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: config?.databaseId || process.env.FIRESTORE_DATABASE || '(default)',
      collectionName: config?.collectionName || this.VECTOR_COLLECTION,
      embeddingDimension: config?.embeddingDimension || 1536,
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
      // Import and create the Firestore Vector Store
      const { FirestoreVectorStore } = await import('../../firestore-vector-store/core.js');

      this.vectorStore = new FirestoreVectorStore({
        projectId: this.config.projectId,
        databaseId: this.config.databaseId,
        collectionName: this.config.collectionName,
        embeddingDimension: this.config.embeddingDimension,
      }) as unknown as VectorStoreInstance;

      await this.vectorStore.initialize();

      this.initialized = true;
      log.info({ collectionName: this.config.collectionName }, 'Vector adapter initialized');
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to initialize Vector adapter');
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
      // Create vector document
      const doc: VectorDocument = {
        id: `${memory.userId}:${memory.id}`,
        text: memory.content,
        embedding: memory.embedding.length > 0 ? memory.embedding : await this.generateEmbedding(memory.content),
        metadata: {
          userId: memory.userId,
          memoryId: memory.id,
          type: memory.type,
          subtype: memory.subtype,
          emotionalWeight: memory.emotionalWeight,
          importance: memory.importance,
          topics: memory.topics,
          peopleMentioned: memory.peopleMentioned,
          createdAt: memory.createdAt.toISOString(),
          isProtected: memory.isProtected,
          isActiveCommitment: memory.isActiveCommitment,
        },
      };

      await this.vectorStore!.addDocument(doc);

      this.recordSuccess(Date.now() - startTime);
      log.debug({ userId: memory.userId, memoryId: memory.id }, 'Memory vector stored');
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  async get(userId: string, memoryId: string): Promise<StoredMemory | null> {
    // Vector store doesn't support direct get - use Firestore adapter
    // This adapter is primarily for search
    return null;
  }

  async update(userId: string, memoryId: string, updates: Partial<StoredMemory>): Promise<void> {
    // For updates, we delete and re-add if content changed
    if (updates.content || updates.embedding) {
      await this.delete(userId, memoryId);
      // Caller should re-store with full memory
    }
  }

  async delete(userId: string, memoryId: string): Promise<void> {
    await this.ensureInitialized();
    const startTime = Date.now();

    try {
      const docId = `${userId}:${memoryId}`;
      await this.vectorStore!.deleteDocument(docId);

      this.recordSuccess(Date.now() - startTime);
      log.debug({ userId, memoryId }, 'Memory vector deleted');
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
      // Build filter
      const filter: Record<string, unknown> = {
        userId: params.userId,
      };

      if (params.types && params.types.length > 0) {
        filter.type = params.types;
      }

      // Search using embedding or text
      let results: VectorSearchResult[];

      if (params.embedding) {
        results = await this.searchByEmbeddingInternal(params.embedding, {
          topK: params.topK || 10,
          minScore: params.minScore || 0.5,
          filter,
        });
      } else if (params.text) {
        results = await this.vectorStore!.search(params.text, {
          topK: params.topK || 10,
          minScore: params.minScore || 0.5,
          filter,
        });
      } else {
        return [];
      }

      // Convert to ScoredMemory format
      const scoredMemories: ScoredMemory[] = results.map((result) => ({
        memory: this.vectorDocToMemory(result.document),
        score: result.score,
        scoreBreakdown: {
          semantic: result.score,
          temporal: 0, // Will be filled by facade
          emotional: (result.document.metadata.emotionalWeight as number) || 0,
          contextual: 0,
        },
        reason: `Semantic similarity: ${(result.score * 100).toFixed(1)}%`,
        triggerType: 'semantic',
      }));

      this.recordSuccess(Date.now() - startTime);
      return scoredMemories;
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  /**
   * Search by embedding vector
   */
  async searchByEmbedding(
    userId: string,
    embedding: number[],
    options?: { topK?: number; minScore?: number }
  ): Promise<ScoredMemory[]> {
    await this.ensureInitialized();
    const startTime = Date.now();

    try {
      const results = await this.searchByEmbeddingInternal(embedding, {
        topK: options?.topK || 10,
        minScore: options?.minScore || 0.5,
        filter: { userId },
      });

      const scoredMemories: ScoredMemory[] = results.map((result) => ({
        memory: this.vectorDocToMemory(result.document),
        score: result.score,
        scoreBreakdown: {
          semantic: result.score,
          temporal: 0,
          emotional: (result.document.metadata.emotionalWeight as number) || 0,
          contextual: 0,
        },
        reason: `Semantic similarity: ${(result.score * 100).toFixed(1)}%`,
        triggerType: 'semantic',
      }));

      this.recordSuccess(Date.now() - startTime);
      return scoredMemories;
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  /**
   * Add embedding to an existing memory
   */
  async addEmbedding(userId: string, memoryId: string, embedding: number[]): Promise<void> {
    // This is handled by the store() method
    // The facade should call store() with the embedding
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH & MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  async health(): Promise<StoreHealth> {
    const totalOps = this.successCount + this.errorCount;
    const errorRate = totalOps > 0 ? this.errorCount / totalOps : 0;

    let storeHealth = { healthy: false, initialized: false, usingFallback: false };
    if (this.vectorStore?.getHealth) {
      storeHealth = this.vectorStore.getHealth();
    }

    return {
      healthy: this.initialized && storeHealth.healthy && errorRate < 0.1,
      name: this.name,
      initialized: this.initialized,
      latencyMs: this.avgLatencyMs,
      errorRate,
      lastError: this.lastError,
      lastSuccess: this.lastSuccess,
    };
  }

  async shutdown(): Promise<void> {
    this.vectorStore = null;
    this.initialized = false;
    log.info('Vector adapter shut down');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EMBEDDING HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate embedding for text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      return await embed(text);
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to generate embedding');
      return [];
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

  private async searchByEmbeddingInternal(
    embedding: number[],
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    if (this.vectorStore?.searchByEmbedding) {
      return this.vectorStore.searchByEmbedding(embedding, options);
    }

    // Fallback: search with dummy text (will use the embedding internally)
    log.warn('Vector store does not support searchByEmbedding, using fallback');
    return [];
  }

  private vectorDocToMemory(doc: VectorDocument): StoredMemory {
    const meta = doc.metadata;
    const [userId, memoryId] = doc.id.split(':');

    return {
      id: memoryId || doc.id,
      userId: (meta.userId as string) || userId,
      type: (meta.type as MemoryType) || 'entity',
      subtype: meta.subtype as string | undefined,
      content: doc.text,
      embedding: doc.embedding || [],
      createdAt: meta.createdAt ? new Date(meta.createdAt as string) : new Date(),
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 0,
      emotionalWeight: (meta.emotionalWeight as number) || 0,
      strength: 1,
      importance: (meta.importance as number) || 0.5,
      isProtected: (meta.isProtected as boolean) || false,
      isActiveCommitment: (meta.isActiveCommitment as boolean) || false,
      topics: (meta.topics as string[]) || [],
      personaIds: [],
      peopleMentioned: (meta.peopleMentioned as string[]) || [],
      metadata: {},
      storageLayer: 'vector',
    };
  }

  private recordSuccess(latencyMs: number): void {
    this.successCount++;
    this.lastSuccess = new Date();

    this.latencyCount++;
    this.avgLatencyMs = this.avgLatencyMs + (latencyMs - this.avgLatencyMs) / this.latencyCount;
  }

  private recordError(error: unknown): void {
    this.errorCount++;
    this.lastError = String(error);
    log.error({ error: String(error) }, 'Vector adapter error');
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let instance: VectorAdapter | null = null;

/**
 * Get or create the Vector adapter singleton
 */
export function getVectorAdapter(config?: VectorAdapterConfig): VectorAdapter {
  if (!instance) {
    instance = new VectorAdapter(config);
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetVectorAdapter(): void {
  instance = null;
}
