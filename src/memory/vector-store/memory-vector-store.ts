/**
 * In-Memory Vector Store
 *
 * Simple in-memory implementation for testing and development.
 * Uses brute-force cosine similarity search.
 *
 * NOT for production use - no persistence, limited capacity.
 *
 * @module memory/vector-store/memory-vector-store
 */

import type {
  IVectorStore,
  VectorDocument,
  VectorSearchOptions,
  VectorSearchResult,
  VectorFilter,
  UpsertResult,
  DeleteResult,
  VectorStoreHealth,
  MemoryVectorConfig,
} from './types.js';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Calculate cosine similarity between two vectors
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

/**
 * Check if a document matches a filter
 */
function matchesFilter(doc: VectorDocument, filter: VectorFilter): boolean {
  if (filter.userId && doc.metadata.userId !== filter.userId) return false;

  if (filter.sourceType) {
    const types = Array.isArray(filter.sourceType) ? filter.sourceType : [filter.sourceType];
    if (!types.includes(doc.metadata.sourceType)) return false;
  }

  if (filter.sourceId && doc.metadata.sourceId !== filter.sourceId) return false;

  if (filter.createdAfter && doc.metadata.createdAt < filter.createdAfter) return false;
  if (filter.createdBefore && doc.metadata.createdAt > filter.createdBefore) return false;

  return true;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export class MemoryVectorStore implements IVectorStore {
  readonly backend = 'memory' as const;

  private vectors = new Map<string, VectorDocument>();
  private config: MemoryVectorConfig;

  constructor(config: Partial<MemoryVectorConfig> = {}) {
    this.config = {
      backend: 'memory',
      dimension: config.dimension ?? 768,
      maxVectors: config.maxVectors ?? 10000,
      enableCache: false,
    };
  }

  async upsert(doc: VectorDocument): Promise<string> {
    // Check capacity
    if (this.vectors.size >= (this.config.maxVectors ?? 10000)) {
      // Evict oldest document
      const oldest = [...this.vectors.entries()]
        .sort((a, b) => a[1].metadata.createdAt.localeCompare(b[1].metadata.createdAt))
        [0];
      if (oldest) {
        this.vectors.delete(oldest[0]);
      }
    }

    const key = doc.namespace ? `${doc.namespace}:${doc.id}` : doc.id;
    this.vectors.set(key, doc);
    return doc.id;
  }

  async upsertBatch(docs: VectorDocument[]): Promise<UpsertResult> {
    const ids: string[] = [];
    for (const doc of docs) {
      const id = await this.upsert(doc);
      ids.push(id);
    }
    return { upsertedCount: ids.length, ids };
  }

  async search(
    queryVector: number[],
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];

    for (const [key, doc] of this.vectors.entries()) {
      // Check namespace
      if (options.namespace) {
        if (!key.startsWith(`${options.namespace}:`)) continue;
      }

      // Check filter
      if (options.filter && !matchesFilter(doc, options.filter)) continue;

      // Calculate similarity
      const score = cosineSimilarity(queryVector, doc.vector);

      // Check minimum score
      if (options.minScore !== undefined && score < options.minScore) continue;

      results.push({
        id: doc.id,
        score,
        metadata: doc.metadata,
        vector: options.includeVector ? doc.vector : undefined,
      });
    }

    // Sort by score descending and limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, options.topK);
  }

  async get(id: string, namespace?: string): Promise<VectorDocument | null> {
    const key = namespace ? `${namespace}:${id}` : id;
    return this.vectors.get(key) ?? null;
  }

  async delete(id: string, namespace?: string): Promise<boolean> {
    const key = namespace ? `${namespace}:${id}` : id;
    return this.vectors.delete(key);
  }

  async deleteByFilter(filter: VectorFilter, namespace?: string): Promise<DeleteResult> {
    let deletedCount = 0;

    for (const [key, doc] of this.vectors.entries()) {
      // Check namespace
      if (namespace && !key.startsWith(`${namespace}:`)) continue;

      // Check filter
      if (matchesFilter(doc, filter)) {
        this.vectors.delete(key);
        deletedCount++;
      }
    }

    return { deletedCount };
  }

  async deleteNamespace(namespace: string): Promise<DeleteResult> {
    let deletedCount = 0;
    const prefix = `${namespace}:`;

    for (const key of this.vectors.keys()) {
      if (key.startsWith(prefix)) {
        this.vectors.delete(key);
        deletedCount++;
      }
    }

    return { deletedCount };
  }

  async getHealth(): Promise<VectorStoreHealth> {
    return {
      healthy: true,
      backend: 'memory',
      vectorCount: this.vectors.size,
      indexStatus: 'ready',
      latencyMs: 0,
    };
  }

  async close(): Promise<void> {
    this.vectors.clear();
  }

  /**
   * Clear all vectors (for testing)
   */
  clear(): void {
    this.vectors.clear();
  }

  /**
   * Get vector count (for testing)
   */
  size(): number {
    return this.vectors.size;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default MemoryVectorStore;
