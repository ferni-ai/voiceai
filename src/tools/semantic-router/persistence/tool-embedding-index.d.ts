/**
 * Tool Embedding Index
 *
 * Pre-computes and persists tool embeddings for fast startup.
 * Tools are embedded once and stored in Firestore + Redis cache.
 *
 * ARCHITECTURE:
 * - First startup: Compute embeddings → Store in Firestore + Redis
 * - Subsequent startups: Load from Redis (fast) → Fallback to Firestore
 * - Version-aware: Re-compute only when tool definitions change
 *
 * BENEFITS:
 * - Eliminates cold-start latency for embedding computation
 * - Reduces API costs (embeddings computed once)
 * - Enables multi-instance consistency
 *
 * @module tools/semantic-router/persistence/tool-embedding-index
 */
import { type PersistedToolEmbeddingIndex } from './firestore-persistence.js';
import type { SemanticToolDefinition, EmbeddingVector } from '../types.js';
type ToolEmbeddingIndex = PersistedToolEmbeddingIndex;
interface IndexStats {
    totalTools: number;
    indexedTools: number;
    cacheHits: number;
    firestoreLoads: number;
    computedFresh: number;
    errors: number;
    lastUpdated: Date | null;
}
declare class ToolEmbeddingIndexService {
    private stats;
    private initialized;
    private cache;
    initialize(): Promise<void>;
    /**
     * Get or compute embeddings for a tool
     *
     * Priority:
     * 1. Redis cache (fastest)
     * 2. Firestore (persistent)
     * 3. Compute fresh (API call)
     */
    getToolEmbeddings(tool: SemanticToolDefinition): Promise<{
        description: EmbeddingVector;
        examples: EmbeddingVector[];
    } | null>;
    /**
     * Batch load/compute embeddings for multiple tools
     * More efficient than individual calls
     */
    batchGetToolEmbeddings(tools: SemanticToolDefinition[]): Promise<Map<string, {
        description: EmbeddingVector;
        examples: EmbeddingVector[];
    }>>;
    /**
     * Force recompute embeddings for a tool (e.g., after tool definition changes)
     */
    recomputeToolEmbeddings(tool: SemanticToolDefinition): Promise<void>;
    /**
     * Clear all cached embeddings (for testing or version migration)
     */
    clearAll(): Promise<void>;
    getStats(): IndexStats;
    private computeEmbeddings;
    private loadFromFirestore;
    private storeIndex;
}
export declare function getToolEmbeddingIndex(): ToolEmbeddingIndexService;
export declare function initializeToolEmbeddingIndex(): Promise<void>;
export type { ToolEmbeddingIndex, IndexStats };
//# sourceMappingURL=tool-embedding-index.d.ts.map