/**
 * Memory Consolidator
 *
 * Automatically consolidates related memories over time to maintain
 * a coherent, efficient memory representation.
 *
 * Philosophy: Like human memory, we don't need to remember every detail
 * of every conversation. We consolidate related memories into richer,
 * more meaningful representations - keeping the essence while letting
 * go of redundancy.
 *
 * When a user mentions their daughter's college plans 8 times across
 * different conversations, we don't need 8 separate memories. We need
 * ONE rich memory that captures the full picture and evolving story.
 */
import type { MemoryItem } from './advanced-retrieval.js';
import { type MemoryError, type Result } from './result.js';
/**
 * A consolidated memory that combines multiple related memories
 */
export interface ConsolidatedMemory {
    id: string;
    topic: string;
    consolidatedContent: string;
    /** IDs of memories that were consolidated */
    sourceMemoryIds: string[];
    /** When this consolidation was created */
    consolidatedAt: Date;
    /** How many times this topic has come up */
    frequency: number;
    /** Aggregate emotional significance */
    emotionalSignature: 'light' | 'medium' | 'heavy';
    /** Key themes extracted from the consolidated memories */
    themes: string[];
    /** Timeline of how the topic evolved */
    evolution: Array<{
        date: Date;
        summary: string;
    }>;
    /** The consolidated embedding */
    embedding?: number[];
}
/**
 * Configuration for memory consolidation
 */
export interface ConsolidationConfig {
    /** Minimum number of related memories before consolidation (default: 5) */
    consolidationThreshold: number;
    /** Similarity threshold for grouping memories (default: 0.75) */
    similarityThreshold: number;
    /** Maximum age of memories to consider for consolidation (days, default: 365) */
    maxAgeDays: number;
    /** Whether to preserve original memories after consolidation (default: true) */
    preserveOriginals: boolean;
    /** Maximum memories to consolidate at once (default: 20) */
    maxBatchSize: number;
}
/**
 * Result of a consolidation pass
 */
export interface ConsolidationResult {
    consolidated: ConsolidatedMemory[];
    memoriesProcessed: number;
    groupsFound: number;
    durationMs: number;
}
export declare class MemoryConsolidator {
    private config;
    constructor(config?: Partial<ConsolidationConfig>);
    /**
     * Find memories that should be consolidated by topic
     *
     * Uses SIMD-accelerated findSimilarPairs for O(n²) pairwise comparison,
     * then builds groups with same greedy semantics as original algorithm.
     */
    findConsolidationCandidates(memories: MemoryItem[], topic?: string): Promise<Map<string, MemoryItem[]>>;
    /**
     * Consolidate memories (supports legacy and new signatures)
     *
     * - **Legacy (v1)**: `consolidateMemories(memories, dryRun)` → returns `ConsolidationResult`
     * - **Current (v2)**: `consolidateMemories(memories, topic)` → returns `Result<ConsolidatedMemory, MemoryError>`
     */
    consolidateMemories(memories: MemoryItem[], topicOrDryRun: string | boolean): Promise<Result<ConsolidatedMemory, MemoryError> | ConsolidationResult>;
    /**
     * Consolidate a group of related memories into one (current internal implementation)
     */
    private consolidateMemoryGroup;
    /**
     * Run a full consolidation pass for a user
     */
    runConsolidationPass(memories: MemoryItem[], existingConsolidations?: ConsolidatedMemory[]): Promise<ConsolidationResult>;
    /**
     * Convert consolidated memory back to a MemoryItem for retrieval
     */
    consolidatedToMemoryItem(consolidated: ConsolidatedMemory): MemoryItem;
    /**
     * Get or compute embeddings for memories
     */
    private getOrComputeEmbeddings;
    /**
     * Extract common topic from a group of memories
     */
    private extractCommonTopic;
    /**
     * Extract summary from content
     */
    private extractSummary;
    /**
     * Extract common themes from memories
     */
    private extractThemes;
    /**
     * Generate consolidated content from memories
     */
    private generateConsolidatedContent;
}
/**
 * Get the default memory consolidator
 */
export declare function getMemoryConsolidator(config?: Partial<ConsolidationConfig>): MemoryConsolidator;
/**
 * Reset the consolidator (for testing)
 */
export declare function resetMemoryConsolidator(): void;
declare const _default: {
    MemoryConsolidator: typeof MemoryConsolidator;
    getMemoryConsolidator: typeof getMemoryConsolidator;
    resetMemoryConsolidator: typeof resetMemoryConsolidator;
};
export default _default;
//# sourceMappingURL=memory-consolidator.d.ts.map