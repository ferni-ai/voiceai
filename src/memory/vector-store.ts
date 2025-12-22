/**
 * Vector Store
 *
 * In-memory vector store for semantic search over embeddings.
 * Supports the persona knowledge base and conversation history.
 *
 * Implements VectorStoreContract interface for swappable backends.
 */

import { getLogger } from '../utils/safe-logger.js';
import { cosineSimilarity, embed, embedBatch } from './embeddings.js';
import type {
  VectorStoreContract,
  VectorDocument,
  VectorFilter,
  VectorSearchResult,
  VectorStoreStats,
} from './vector-store-interface.js';

// Re-export types from interface for backwards compatibility
export type { VectorDocument, VectorFilter, VectorSearchResult } from './vector-store-interface.js';

// ============================================================================
// VECTOR STORE IMPLEMENTATION
// ============================================================================

/**
 * In-memory vector store for semantic search
 * Implements VectorStoreContract for swappable backends
 */
export class VectorStore implements VectorStoreContract {
  private documents = new Map<string, VectorDocument>();
  private embeddings = new Map<string, number[]>();
  private _initialized = false;

  /**
   * Initialize the vector store
   */
  async initialize(): Promise<void> {
    this._initialized = true;
    getLogger().info('VectorStore initialized');
    return Promise.resolve();
  }

  /**
   * Check if initialized
   */
  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Add a document to the store
   */
  async addDocument(doc: VectorDocument): Promise<void> {
    // Generate embedding if not provided
    if (!doc.embedding) {
      doc.embedding = await embed(doc.text);
    }

    this.documents.set(doc.id, doc);
    this.embeddings.set(doc.id, doc.embedding);

    getLogger().debug(`Added document: ${doc.id} (${doc.metadata.source})`);
  }

  /**
   * Add multiple documents in batch
   */
  async addDocuments(docs: VectorDocument[]): Promise<void> {
    // Split into docs with and without embeddings
    const needsEmbedding = docs.filter((d) => !d.embedding);
    const hasEmbedding = docs.filter((d) => d.embedding);

    // Generate embeddings in batch
    if (needsEmbedding.length > 0) {
      const texts = needsEmbedding.map((d) => d.text);
      const embeddings = await embedBatch(texts);

      for (let i = 0; i < needsEmbedding.length; i++) {
        needsEmbedding[i].embedding = embeddings[i];
      }
    }

    // Store all documents
    for (const doc of [...needsEmbedding, ...hasEmbedding]) {
      this.documents.set(doc.id, doc);
      this.embeddings.set(doc.id, doc.embedding!);
    }

    getLogger().info(`Added ${docs.length} documents to vector store`);
  }

  /**
   * Remove a document from the store
   */
  removeDocument(id: string): boolean {
    const existed = this.documents.has(id);
    this.documents.delete(id);
    this.embeddings.delete(id);
    return existed;
  }

  /**
   * Get a document by ID
   */
  getDocument(id: string): VectorDocument | undefined {
    return this.documents.get(id);
  }

  /**
   * Check if filter matches document
   */
  private matchesFilter(doc: VectorDocument, filter?: VectorFilter): boolean {
    if (!filter) return true;

    // Source filter
    if (filter.source) {
      const sources = Array.isArray(filter.source) ? filter.source : [filter.source];
      if (!sources.includes(doc.metadata.source)) return false;
    }

    // Category filter
    if (filter.category) {
      const categories = Array.isArray(filter.category) ? filter.category : [filter.category];
      if (!doc.metadata.category || !categories.includes(doc.metadata.category)) return false;
    }

    // User ID filter
    if (filter.userId && doc.metadata.userId !== filter.userId) {
      return false;
    }

    // Timestamp filters
    if (filter.minTimestamp && doc.metadata.timestamp) {
      if (new Date(doc.metadata.timestamp) < filter.minTimestamp) return false;
    }
    if (filter.maxTimestamp && doc.metadata.timestamp) {
      if (new Date(doc.metadata.timestamp) > filter.maxTimestamp) return false;
    }

    // Custom metadata filters
    if (filter.metadata) {
      for (const [key, value] of Object.entries(filter.metadata)) {
        if (doc.metadata[key] !== value) return false;
      }
    }

    return true;
  }

  /**
   * Semantic search for similar documents
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
    const queryEmbedding = await embed(query);

    // Filter documents
    const filteredDocs: Array<{ doc: VectorDocument; embedding: number[] }> = [];
    for (const [id, doc] of this.documents) {
      if (this.matchesFilter(doc, options?.filter)) {
        const docEmbedding = this.embeddings.get(id);
        if (docEmbedding) {
          filteredDocs.push({ doc, embedding: docEmbedding });
        }
      }
    }

    if (filteredDocs.length === 0) {
      return [];
    }

    // Calculate similarities
    const results: VectorSearchResult[] = filteredDocs.map(({ doc, embedding }) => ({
      document: doc,
      score: cosineSimilarity(queryEmbedding, embedding),
    }));

    // Sort by score and filter by minimum
    return results
      .filter((r) => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Search by embedding directly (for pre-computed queries)
   */
  searchByEmbedding(
    queryEmbedding: number[],
    options?: {
      topK?: number;
      filter?: VectorFilter;
      minScore?: number;
    }
  ): VectorSearchResult[] {
    const topK = options?.topK || 5;
    const minScore = options?.minScore || 0;

    // Filter documents
    const filteredDocs: Array<{ doc: VectorDocument; embedding: number[] }> = [];
    for (const [id, doc] of this.documents) {
      if (this.matchesFilter(doc, options?.filter)) {
        const docEmbedding = this.embeddings.get(id);
        if (docEmbedding) {
          filteredDocs.push({ doc, embedding: docEmbedding });
        }
      }
    }

    if (filteredDocs.length === 0) {
      return [];
    }

    // Calculate similarities
    const results: VectorSearchResult[] = filteredDocs.map(({ doc, embedding }) => ({
      document: doc,
      score: cosineSimilarity(queryEmbedding, embedding),
    }));

    // Sort by score and filter by minimum
    return results
      .filter((r) => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Get all documents matching a filter
   */
  list(filter?: VectorFilter): VectorDocument[] {
    const results: VectorDocument[] = [];
    for (const doc of this.documents.values()) {
      if (this.matchesFilter(doc, filter)) {
        results.push(doc);
      }
    }
    return results;
  }

  /**
   * Get store statistics
   */
  getStats(): VectorStoreStats {
    const bySource: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    for (const doc of this.documents.values()) {
      bySource[doc.metadata.source] = (bySource[doc.metadata.source] || 0) + 1;
      if (doc.metadata.category) {
        byCategory[doc.metadata.category] = (byCategory[doc.metadata.category] || 0) + 1;
      }
    }

    return {
      documentCount: this.documents.size,
      bySource,
      byCategory,
    };
  }

  /**
   * Clear all documents
   */
  clear(): void {
    this.documents.clear();
    this.embeddings.clear();
    getLogger().info('VectorStore cleared');
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let defaultVectorStore: VectorStore | null = null;

/**
 * Get the default vector store instance
 */
export function getVectorStore(): VectorStore {
  if (!defaultVectorStore) {
    defaultVectorStore = new VectorStore();
  }
  return defaultVectorStore;
}

/**
 * Reset the default vector store (for testing)
 */
export function resetVectorStore(): void {
  if (defaultVectorStore) {
    defaultVectorStore.clear();
    defaultVectorStore = null;
  }
}

export default VectorStore;
