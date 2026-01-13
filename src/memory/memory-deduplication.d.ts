/**
 * Memory Deduplication
 *
 * Prevents storing semantically duplicate memories to maintain
 * a clean, efficient memory store.
 *
 * Philosophy: When someone tells you the same story twice, you don't
 * store two separate memories. You recognize it's the same story,
 * maybe with new details, and update your understanding accordingly.
 *
 * Deduplication ensures we:
 * 1. Don't waste storage on near-identical memories
 * 2. Merge new details into existing memories
 * 3. Track how often topics come up (frequency signal)
 * 4. Maintain a single source of truth per topic
 */
import type { MemoryItem } from './advanced-retrieval.js';
import { type MemoryError, type Result } from './result.js';
import type { VectorDocument } from './vector-store-interface.js';
/**
 * Result of a duplicate check
 */
export interface DuplicateCheckResult {
    isDuplicate: boolean;
    duplicateOf?: string;
    similarity: number;
    recommendation: 'store' | 'skip' | 'merge';
    mergeTarget?: MemoryItem | VectorDocument;
}
/**
 * Result of a merge operation
 */
export interface MergeResult {
    merged: MemoryItem;
    sourceIds: string[];
    newDetails: string[];
}
/**
 * Configuration for deduplication
 */
export interface DeduplicationConfig {
    /** Similarity threshold for exact duplicates (default: 0.95) */
    exactDuplicateThreshold: number;
    /** Similarity threshold for merge candidates (default: 0.85) */
    mergeThreshold: number;
    /** Minimum similarity to consider related (default: 0.70) */
    relatedThreshold: number;
    /** Maximum age difference (days) for merge candidates (default: 90) */
    maxAgeDifferenceForMerge: number;
    /** Whether to allow cross-topic merging (default: false) */
    allowCrossTopicMerge: boolean;
    /** Use cached embeddings for efficiency (default: true) */
    useCachedEmbeddings: boolean;
}
/**
 * Deduplication statistics
 */
export interface DeduplicationStats {
    checksPerformed: number;
    duplicatesFound: number;
    mergesPerformed: number;
    storageBypass: number;
    averageSimilarity: number;
}
export declare class MemoryDeduplicator {
    private config;
    private stats;
    private similaritySum;
    constructor(config?: Partial<DeduplicationConfig>);
    /**
     * Check if a new memory is a duplicate of any existing memory
     */
    checkDuplicate(newMemory: MemoryItem | VectorDocument, existingMemories: Array<MemoryItem | VectorDocument>): Promise<Result<DuplicateCheckResult, MemoryError>>;
    /**
     * Merge two similar memories into one enhanced memory
     */
    mergeMemories(existing: MemoryItem, incoming: MemoryItem): Promise<Result<MergeResult, MemoryError>>;
    /**
     * Find all near-duplicates in a set of memories
     *
     * Uses SIMD-accelerated findSimilarPairs for O(n²) pairwise comparison,
     * then builds clusters with same greedy semantics as original algorithm.
     */
    findDuplicateClusters(memories: MemoryItem[]): Promise<Map<string, string[]>>;
    /**
     * Get deduplication statistics
     */
    getStats(): DeduplicationStats;
    /**
     * Reset statistics
     */
    resetStats(): void;
    /**
     * Check if two memories should be merged
     */
    private shouldMerge;
    /**
     * Extract details from new content that aren't in existing
     */
    private extractNewDetails;
    /**
     * Get embedding from memory or document
     */
    private getEmbedding;
    /**
     * Get ID from memory or document
     */
    private getId;
    /**
     * Get timestamp from memory or document
     */
    private getTimestamp;
    /**
     * Get topics from memory or document
     */
    private getTopics;
}
/**
 * Get the default deduplicator
 */
export declare function getMemoryDeduplicator(config?: Partial<DeduplicationConfig>): MemoryDeduplicator;
/**
 * Reset the deduplicator (for testing)
 */
export declare function resetMemoryDeduplicator(): void;
declare const _default: {
    MemoryDeduplicator: typeof MemoryDeduplicator;
    getMemoryDeduplicator: typeof getMemoryDeduplicator;
    resetMemoryDeduplicator: typeof resetMemoryDeduplicator;
};
export default _default;
//# sourceMappingURL=memory-deduplication.d.ts.map