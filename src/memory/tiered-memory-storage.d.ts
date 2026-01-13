/**
 * Tiered Memory Storage System
 *
 * PERFORMANCE OPTIMIZATION: Store frequently accessed memories in faster storage.
 * From FUTURE-OPTIMIZATIONS.md Phase 2.3.
 *
 * Tiers:
 * - Hot (Redis): 1-5ms latency, 1MB/user capacity
 * - Warm (Firestore): 50-100ms latency, 100MB/user capacity
 * - Cold (Cloud Storage): 200-500ms latency, unlimited capacity (future)
 *
 * Promotion/Demotion Logic:
 * - Access count > 5 in 24 hours → promote to Hot
 * - No access for 7 days → demote from Hot to Warm
 * - Background worker handles migrations
 *
 * @module memory/tiered-memory-storage
 */
import type { MemoryItem } from './interfaces/index.js';
export interface TieredMemoryConfig {
    /** Minimum access count in 24h to promote to hot tier */
    promotionThreshold: number;
    /** Days without access before demotion from hot tier */
    demotionDays: number;
    /** Maximum items per user in hot tier */
    maxHotItemsPerUser: number;
    /** TTL for hot tier items in seconds */
    hotTierTTLSeconds: number;
    /** Whether to enable tiered storage */
    enabled: boolean;
}
export interface TieredMemoryStats {
    hotTierSize: number;
    hotTierHits: number;
    hotTierMisses: number;
    promotions: number;
    demotions: number;
    avgHotTierLatencyMs: number;
    avgWarmTierLatencyMs: number;
}
export interface MemoryAccessRecord {
    memoryId: string;
    userId: string;
    accessCount: number;
    lastAccessedAt: number;
    promotedAt?: number;
    tier: 'hot' | 'warm' | 'cold';
}
export declare function setTieredMemoryConfig(newConfig: Partial<TieredMemoryConfig>): void;
export declare function getTieredMemoryConfig(): TieredMemoryConfig;
/**
 * Store a memory in hot tier (Redis)
 */
export declare function storeInHotTier(userId: string, memory: MemoryItem): Promise<boolean>;
/**
 * Get a memory from hot tier (Redis)
 */
export declare function getFromHotTier(userId: string, memoryId: string): Promise<MemoryItem | null>;
/**
 * Remove a memory from hot tier
 */
export declare function removeFromHotTier(userId: string, memoryId: string): Promise<boolean>;
/**
 * Record a memory access and potentially promote to hot tier
 */
export declare function recordMemoryAccess(userId: string, memory: MemoryItem): Promise<void>;
/**
 * Check if a memory should be demoted from hot tier
 */
export declare function shouldDemote(record: MemoryAccessRecord): boolean;
/**
 * Run demotion check for all hot tier items
 * Call this periodically (e.g., hourly) via background worker
 */
export declare function runDemotionCheck(): Promise<{
    demoted: number;
}>;
/**
 * Retrieve a memory using tiered storage.
 *
 * Order:
 * 1. Check hot tier (Redis) first
 * 2. Fall back to warm tier callback
 * 3. Record access for future promotion
 *
 * @param userId - User ID
 * @param memoryId - Memory ID to retrieve
 * @param warmTierFetcher - Callback to fetch from warm tier (Firestore)
 */
export declare function getMemoryTiered(userId: string, memoryId: string, warmTierFetcher: () => Promise<MemoryItem | null>): Promise<MemoryItem | null>;
/**
 * Retrieve multiple memories using tiered storage.
 * Checks hot tier for all, then batch fetches missing from warm tier.
 */
export declare function getMemoriesTiered(userId: string, memoryIds: string[], warmTierBatchFetcher: (ids: string[]) => Promise<Map<string, MemoryItem>>): Promise<Map<string, MemoryItem>>;
/**
 * Get tiered memory stats for monitoring
 */
export declare function getTieredMemoryStats(): TieredMemoryStats;
/**
 * Reset stats (for testing)
 */
export declare function resetTieredMemoryStats(): void;
/**
 * Clear all access records (for testing)
 */
export declare function clearAccessRecords(): void;
/**
 * Get access records for a user (for debugging)
 */
export declare function getUserAccessRecords(userId: string): MemoryAccessRecord[];
declare const _default: {
    storeInHotTier: typeof storeInHotTier;
    getFromHotTier: typeof getFromHotTier;
    removeFromHotTier: typeof removeFromHotTier;
    recordMemoryAccess: typeof recordMemoryAccess;
    runDemotionCheck: typeof runDemotionCheck;
    getMemoryTiered: typeof getMemoryTiered;
    getMemoriesTiered: typeof getMemoriesTiered;
    getTieredMemoryStats: typeof getTieredMemoryStats;
    resetTieredMemoryStats: typeof resetTieredMemoryStats;
    clearAccessRecords: typeof clearAccessRecords;
    getUserAccessRecords: typeof getUserAccessRecords;
    setTieredMemoryConfig: typeof setTieredMemoryConfig;
    getTieredMemoryConfig: typeof getTieredMemoryConfig;
};
export default _default;
//# sourceMappingURL=tiered-memory-storage.d.ts.map