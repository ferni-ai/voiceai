/**
 * Memory Lane - Memory Collector
 *
 * Aggregates memorable moments from various existing data sources:
 * - Commitment Keeper (promises kept)
 * - Dream Keeper (dream progress)
 * - Inside Joke Memory (funny/shared moments)
 * - Relationship Milestones (growth markers)
 * - Celebration Momentum (wins and breakthroughs)
 *
 * This service transforms raw data from these sources into unified
 * MemoryHighlight objects suitable for Memory Lane.
 *
 * @module services/memory-lane/memory-collector
 */
import type { MemoryHighlight, MemoryType, MemoryCollectionInput, MemoryCollectionResult } from './types.js';
/**
 * Collect memories from completed commitments
 */
export declare function collectFromCommitments(userId: string): Promise<MemoryHighlight[]>;
/**
 * Collect memories from dreams (achieved or with significant progress)
 */
export declare function collectFromDreams(userId: string): Promise<MemoryHighlight[]>;
/**
 * Collect memories from inside jokes and shared moments
 */
export declare function collectFromSharedMoments(userId: string): Promise<MemoryHighlight[]>;
/**
 * Collect memories from relationship milestones
 */
export declare function collectFromMilestones(userId: string): Promise<MemoryHighlight[]>;
/**
 * Collect memories from celebration wins
 */
export declare function collectFromCelebrations(userId: string): Promise<MemoryHighlight[]>;
/**
 * Save a memory highlight to Firestore
 */
export declare function saveMemory(memory: MemoryHighlight): Promise<boolean>;
/**
 * Load all memory highlights for a user
 */
export declare function loadMemories(userId: string, options?: {
    limit?: number;
    types?: MemoryType[];
}): Promise<MemoryHighlight[]>;
/**
 * Get memories for "On This Day" (same month/day from previous years)
 */
export declare function loadOnThisDayMemories(userId: string): Promise<MemoryHighlight[]>;
/**
 * Collect and save all new memories for a user
 */
export declare function collectAllMemories(userId: string): Promise<{
    collected: number;
    saved: number;
    errors: string[];
}>;
/**
 * Process a single memory collection input (for real-time capture)
 */
export declare function processCollectionInput(input: MemoryCollectionInput): Promise<MemoryCollectionResult>;
export declare const memoryCollector: {
    collectFromCommitments: typeof collectFromCommitments;
    collectFromDreams: typeof collectFromDreams;
    collectFromSharedMoments: typeof collectFromSharedMoments;
    collectFromMilestones: typeof collectFromMilestones;
    collectFromCelebrations: typeof collectFromCelebrations;
    collectAllMemories: typeof collectAllMemories;
    processCollectionInput: typeof processCollectionInput;
    saveMemory: typeof saveMemory;
    loadMemories: typeof loadMemories;
    loadOnThisDayMemories: typeof loadOnThisDayMemories;
};
//# sourceMappingURL=memory-collector.d.ts.map