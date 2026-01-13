/**
 * Protection Engine
 *
 * Protects important memories from decay. Some memories are too important
 * to fade - core identity, emotional milestones, user-marked memories.
 *
 * This is "Better Than Human" because humans can't consciously protect
 * memories, but Ferni can identify and preserve what matters.
 *
 * @module memory/protection-engine
 */
import type { MemoryItem } from './interfaces/index.js';
export type ProtectionLevel = 'core_identity' | 'emotional_milestone' | 'life_milestone' | 'commitment' | 'relationship_core' | 'user_marked';
export interface ProtectedMemory {
    memoryId: string;
    userId: string;
    protectionLevel: ProtectionLevel;
    protectedAt: Date;
    reason: string;
    expiresAt?: Date;
    metadata?: Record<string, unknown>;
}
export interface ProtectionConfig {
    emotionalWeightThreshold: number;
    accessCountThreshold: number;
    protectedTypes: Array<MemoryItem['type']>;
    coreIdentityKeywords: string[];
    milestoneKeywords: string[];
    commitmentProtectionTTL: number;
}
export declare class ProtectionEngine {
    private db;
    private config;
    private protectionCache;
    private cacheTTL;
    private cacheExpiry;
    constructor(config?: Partial<ProtectionConfig>);
    /**
     * Check if a memory is protected
     */
    isProtected(userId: string, memoryId: string): Promise<boolean>;
    /**
     * Get protection level for a memory (null if not protected)
     */
    getProtectionLevel(userId: string, memoryId: string): Promise<ProtectionLevel | null>;
    /**
     * Protect a memory
     */
    protect(userId: string, memoryId: string, level: ProtectionLevel, reason: string, expiresAt?: Date): Promise<ProtectedMemory>;
    /**
     * Remove protection from a memory
     */
    unprotect(userId: string, memoryId: string): Promise<void>;
    /**
     * Get all protections for a user
     */
    getProtections(userId: string): Promise<ProtectedMemory[]>;
    /**
     * Analyze a memory and auto-protect if it meets criteria
     */
    analyzeAndProtect(memory: MemoryItem, userId: string): Promise<ProtectedMemory | null>;
    /**
     * Batch analyze memories and protect as needed
     */
    analyzeAndProtectBatch(userId: string, memories: MemoryItem[]): Promise<{
        protected: number;
        skipped: number;
    }>;
    /**
     * Clean up expired protections
     */
    cleanupExpired(userId: string): Promise<number>;
    /**
     * Get protection statistics
     */
    getStats(userId: string): Promise<{
        total: number;
        byLevel: Record<ProtectionLevel, number>;
        expiringSoon: number;
    }>;
    private isExpired;
    private isCacheValid;
}
export declare function getProtectionEngine(): ProtectionEngine;
export declare function resetProtectionEngine(): void;
declare const _default: {
    ProtectionEngine: typeof ProtectionEngine;
    getProtectionEngine: typeof getProtectionEngine;
    resetProtectionEngine: typeof resetProtectionEngine;
};
export default _default;
//# sourceMappingURL=protection-engine.d.ts.map