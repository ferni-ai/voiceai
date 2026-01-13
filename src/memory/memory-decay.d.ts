/**
 * Memory Decay System
 *
 * Implements graceful forgetting with configurable decay curves.
 * Emotional memories persist longer, commitments are protected,
 * and re-mentioned topics get refreshed.
 *
 * Philosophy: "Better than human" doesn't mean remembering everything
 * forever. It means remembering what matters - emotional moments,
 * commitments, turning points - while letting trivial details fade.
 *
 * This mirrors how healthy human memory works, but with perfect
 * fidelity for the things that truly matter.
 */
import type { MemoryItem } from './advanced-retrieval.js';
/**
 * Configuration for memory decay
 */
export interface MemoryDecayConfig {
    /** Base half-life in days (default: 90) */
    baseHalfLifeDays: number;
    /** Multiplier for emotional memories (default: 3.0) */
    emotionalMultiplier: number;
    /** Whether commitments are protected from decay (default: true) */
    commitmentProtection: boolean;
    /** Boost applied when a memory is re-activated (default: 2.0) */
    reactivationBoost: number;
    /** Minimum strength before archival (default: 0.1) */
    archivalThreshold: number;
    /** Types that never decay */
    protectedTypes: Array<MemoryItem['type']>;
    /** Maximum decay rate per day (prevents instant forgetting) */
    maxDecayRatePerDay: number;
}
/**
 * Memory with decay metadata
 */
export interface DecayingMemory extends MemoryItem {
    /** Current strength (0-1) */
    strength: number;
    /** Last time this memory was accessed/mentioned */
    lastAccessed: Date;
    /** Number of times this memory has been reactivated */
    reactivationCount: number;
    /** Whether this memory is archived (still searchable but deprioritized) */
    archived: boolean;
}
/**
 * Result of decay calculation
 */
export interface DecayResult {
    currentStrength: number;
    effectiveHalfLife: number;
    daysSinceAccess: number;
    isProtected: boolean;
    shouldArchive: boolean;
}
/**
 * Pruning result
 */
export interface PruneResult {
    archived: string[];
    preserved: number;
    strengthDistribution: {
        strong: number;
        moderate: number;
        weak: number;
    };
}
export declare class MemoryDecayManager {
    private config;
    constructor(config?: Partial<MemoryDecayConfig>);
    /**
     * Calculate the current strength of a memory
     */
    calculateStrength(memory: MemoryItem | DecayingMemory): DecayResult;
    /**
     * Check if a memory is protected from decay
     */
    isProtected(memory: MemoryItem): boolean;
    /**
     * Reactivate a memory (user mentioned it again)
     */
    reactivate(memory: DecayingMemory): DecayingMemory;
    /**
     * Convert a MemoryItem to DecayingMemory
     */
    initializeDecay(memory: MemoryItem): DecayingMemory;
    /**
     * Update decay for all memories
     */
    updateDecay(memories: DecayingMemory[]): DecayingMemory[];
    /**
     * Prune weak memories (archive them, don't delete)
     */
    pruneWeakMemories(memories: DecayingMemory[]): PruneResult;
    /**
     * Get memories sorted by strength (strongest first)
     */
    sortByStrength(memories: DecayingMemory[]): DecayingMemory[];
    /**
     * Filter to only active (non-archived) memories
     */
    filterActive(memories: DecayingMemory[]): DecayingMemory[];
    /**
     * Get decay statistics for a memory set
     */
    getDecayStats(memories: DecayingMemory[]): {
        totalMemories: number;
        activeMemories: number;
        archivedMemories: number;
        protectedMemories: number;
        averageStrength: number;
        oldestActive: Date | null;
        newestActive: Date | null;
    };
    /**
     * Simulate decay over time (for testing/visualization)
     */
    simulateDecay(memory: MemoryItem, daysToSimulate: number, stepDays?: number): Array<{
        day: number;
        strength: number;
    }>;
    /**
     * Legacy API: applyDecay(memory) → DecayResult
     *
     * Older tests/callers passed a simplified memory shape (no `type`, `source`, etc.).
     * We adapt it into a `MemoryItem` and reuse the v2 decay calculation.
     */
    applyDecay(memory: {
        id: string;
        content: string;
        timestamp: Date;
        emotionalWeight: number;
        initialStrength?: number;
        hasCommitment?: boolean;
    }): DecayResult;
    /**
     * Legacy API: pruneWeak(memories, dryRun) → { analyzed, pruned, preserved }
     *
     * In v2, we "prune" by archiving (never hard delete). This helper mirrors the
     * older return shape while using v2 decay logic.
     */
    pruneWeak(memories: Array<{
        id: string;
        content: string;
        timestamp: Date;
        emotionalWeight: number;
        initialStrength?: number;
        hasCommitment?: boolean;
    }>, _dryRun?: boolean): {
        analyzed: number;
        pruned: string[];
        preserved: number;
    };
    private clamp01;
}
/**
 * Get the default decay manager
 */
export declare function getMemoryDecayManager(config?: Partial<MemoryDecayConfig>): MemoryDecayManager;
/**
 * Reset the decay manager (for testing)
 */
export declare function resetMemoryDecayManager(): void;
declare const _default: {
    MemoryDecayManager: typeof MemoryDecayManager;
    getMemoryDecayManager: typeof getMemoryDecayManager;
    resetMemoryDecayManager: typeof resetMemoryDecayManager;
};
export default _default;
//# sourceMappingURL=memory-decay.d.ts.map