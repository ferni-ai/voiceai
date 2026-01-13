/**
 * Associative Memory System
 *
 * Models human-like associative memory triggers.
 * When someone mentions something, what would genuinely surface in a friend's mind?
 *
 * Philosophy: Human memory isn't a database query. When a friend mentions "my daughter",
 * you don't search for "daughter" - you naturally think of the time they proudly showed
 * you her artwork, their worry about college applications, that funny story from her
 * childhood. This module models those natural associations.
 *
 * @module memory/associative-memory
 */
import type { AssociativeMemoryService, AssociativeTrigger, TriggeredMemory, MemoryItem, RetrievalContext } from './interfaces/index.js';
interface AssociativeConfig {
    /** Minimum strength to fire a trigger (default: 0.3) */
    minFiringStrength: number;
    /** Strength decay per day since last fired (default: 0.01) */
    strengthDecayPerDay: number;
    /** Boost when trigger fires (default: 0.1) */
    firingBoost: number;
    /** Maximum triggers per memory (default: 10) */
    maxTriggersPerMemory: number;
    /** Maximum triggered memories to return (default: 5) */
    maxTriggeredMemories: number;
}
export declare class AssociativeMemory implements AssociativeMemoryService {
    private config;
    private triggers;
    private memories;
    constructor(config?: Partial<AssociativeConfig>);
    /**
     * Register associative triggers for a memory
     */
    registerTrigger(memoryId: string, triggers: Array<Omit<AssociativeTrigger, 'triggerId' | 'createdAt' | 'lastFired' | 'fireCount'>>): Promise<void>;
    /**
     * Get memories triggered by user text
     */
    getTriggeredMemories(userText: string, context: RetrievalContext): Promise<TriggeredMemory[]>;
    /**
     * Record that a trigger was fired (used)
     */
    recordTriggerFired(triggerId: string): Promise<void>;
    /**
     * Get strongest triggers for a memory
     */
    getStrongestTriggers(memoryId: string): Promise<AssociativeTrigger[]>;
    /**
     * Register a memory and automatically create associative triggers
     */
    registerMemory(memory: MemoryItem): void;
    /**
     * Extract potential triggers from text
     */
    private extractTriggersFromText;
    /**
     * Calculate initial strength for an auto-generated trigger
     */
    private calculateInitialStrength;
    /**
     * Generate a natural reference for a triggered memory
     */
    private generateNaturalReference;
    /**
     * Export for persistence
     */
    export(): {
        triggers: Array<[string, AssociativeTrigger[]]>;
        memories: Array<[string, MemoryItem]>;
    };
    /**
     * Import from persistence
     */
    import(data: {
        triggers: Array<[string, AssociativeTrigger[]]>;
        memories: Array<[string, MemoryItem]>;
    }): void;
    /**
     * Get stats
     */
    getStats(): {
        totalMemories: number;
        totalTriggers: number;
        avgTriggersPerMemory: number;
    };
}
/**
 * Get associative memory for a user (with Firestore persistence)
 */
export declare function getAssociativeMemory(userId: string): AssociativeMemory;
/**
 * Save associative memory to Firestore
 */
export declare function saveAssociativeMemory(userId: string): Promise<void>;
/**
 * Clear associative memory for a user
 */
export declare function clearAssociativeMemory(userId: string): void;
declare const _default: {
    AssociativeMemory: typeof AssociativeMemory;
    getAssociativeMemory: typeof getAssociativeMemory;
    saveAssociativeMemory: typeof saveAssociativeMemory;
    clearAssociativeMemory: typeof clearAssociativeMemory;
};
export default _default;
//# sourceMappingURL=associative-memory.d.ts.map