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
import { createLogger } from '../utils/safe-logger.js';
import { getRedisCache } from './redis-cache.js';
const log = createLogger({ module: 'TieredMemoryStorage' });
// ============================================================================
// CONFIGURATION
// ============================================================================
const DEFAULT_CONFIG = {
    promotionThreshold: 5, // 5 accesses in 24h to promote
    demotionDays: 7, // Demote after 7 days without access
    maxHotItemsPerUser: 50, // Max 50 items per user in hot tier
    hotTierTTLSeconds: 3600, // 1 hour TTL in Redis
    enabled: process.env.TIERED_MEMORY_ENABLED !== 'false',
};
let config = { ...DEFAULT_CONFIG };
export function setTieredMemoryConfig(newConfig) {
    config = { ...config, ...newConfig };
}
export function getTieredMemoryConfig() {
    return { ...config };
}
// ============================================================================
// ACCESS TRACKING (In-Memory for Now)
// ============================================================================
/**
 * In-memory access tracking for quick decisions.
 * Key: `${userId}:${memoryId}`
 */
const accessRecords = new Map();
/**
 * Track stats for monitoring
 */
const stats = {
    hotTierSize: 0,
    hotTierHits: 0,
    hotTierMisses: 0,
    promotions: 0,
    demotions: 0,
    avgHotTierLatencyMs: 0,
    avgWarmTierLatencyMs: 0,
};
const latencyHistory = {
    hot: [],
    warm: [],
};
function recordLatency(tier, latencyMs) {
    const history = latencyHistory[tier];
    history.push(latencyMs);
    // Keep only last 100 samples
    if (history.length > 100) {
        history.shift();
    }
    // Update rolling average
    const avg = history.reduce((sum, l) => sum + l, 0) / history.length;
    if (tier === 'hot') {
        stats.avgHotTierLatencyMs = avg;
    }
    else {
        stats.avgWarmTierLatencyMs = avg;
    }
}
// ============================================================================
// HOT TIER OPERATIONS (Redis)
// ============================================================================
/**
 * Generate Redis key for hot tier memory
 */
function getHotTierKey(userId, memoryId) {
    return `memory:hot:${userId}:${memoryId}`;
}
/**
 * Generate Redis key for user's hot tier index
 */
function getHotTierIndexKey(userId) {
    return `memory:hot:${userId}:index`;
}
/**
 * Store a memory in hot tier (Redis)
 */
export async function storeInHotTier(userId, memory) {
    if (!config.enabled)
        return false;
    const redis = getRedisCache();
    if (!redis.isConnected()) {
        log.debug('Redis not connected, skipping hot tier store');
        return false;
    }
    try {
        const key = getHotTierKey(userId, memory.id);
        const indexKey = getHotTierIndexKey(userId);
        // Store the memory
        const success = await redis.set(key, memory, config.hotTierTTLSeconds);
        if (!success)
            return false;
        // Add to user's hot tier index
        await redis.set(indexKey, Date.now(), config.hotTierTTLSeconds);
        // Update tracking
        const trackKey = `${userId}:${memory.id}`;
        const record = accessRecords.get(trackKey) || {
            memoryId: memory.id,
            userId,
            accessCount: 0,
            lastAccessedAt: Date.now(),
            tier: 'warm',
        };
        record.tier = 'hot';
        record.promotedAt = Date.now();
        accessRecords.set(trackKey, record);
        stats.hotTierSize++;
        log.debug({ userId, memoryId: memory.id }, 'Stored memory in hot tier');
        return true;
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to store in hot tier');
        return false;
    }
}
/**
 * Get a memory from hot tier (Redis)
 */
export async function getFromHotTier(userId, memoryId) {
    if (!config.enabled)
        return null;
    const redis = getRedisCache();
    if (!redis.isConnected()) {
        return null;
    }
    const start = Date.now();
    try {
        const key = getHotTierKey(userId, memoryId);
        const memory = await redis.get(key);
        const latency = Date.now() - start;
        recordLatency('hot', latency);
        if (memory) {
            stats.hotTierHits++;
            log.debug({ userId, memoryId, latencyMs: latency }, 'Hot tier hit');
            return memory;
        }
        stats.hotTierMisses++;
        return null;
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to get from hot tier');
        return null;
    }
}
/**
 * Remove a memory from hot tier
 */
export async function removeFromHotTier(userId, memoryId) {
    if (!config.enabled)
        return false;
    const redis = getRedisCache();
    if (!redis.isConnected()) {
        return false;
    }
    try {
        const key = getHotTierKey(userId, memoryId);
        const deleted = await redis.delete(key);
        if (deleted) {
            stats.hotTierSize = Math.max(0, stats.hotTierSize - 1);
            // Update tracking
            const trackKey = `${userId}:${memoryId}`;
            const record = accessRecords.get(trackKey);
            if (record) {
                record.tier = 'warm';
                record.promotedAt = undefined;
            }
        }
        return deleted;
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to remove from hot tier');
        return false;
    }
}
// ============================================================================
// ACCESS TRACKING & PROMOTION/DEMOTION
// ============================================================================
/**
 * Record a memory access and potentially promote to hot tier
 */
export async function recordMemoryAccess(userId, memory) {
    if (!config.enabled)
        return;
    const trackKey = `${userId}:${memory.id}`;
    const now = Date.now();
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    // Get or create access record
    let record = accessRecords.get(trackKey);
    if (!record) {
        record = {
            memoryId: memory.id,
            userId,
            accessCount: 0,
            lastAccessedAt: now,
            tier: 'warm',
        };
        accessRecords.set(trackKey, record);
    }
    // Reset count if last access was more than 24h ago
    if (record.lastAccessedAt < twentyFourHoursAgo) {
        record.accessCount = 0;
    }
    // Increment access
    record.accessCount++;
    record.lastAccessedAt = now;
    // Check for promotion
    if (record.tier === 'warm' && record.accessCount >= config.promotionThreshold) {
        const promoted = await storeInHotTier(userId, memory);
        if (promoted) {
            stats.promotions++;
            log.info({ userId, memoryId: memory.id, accessCount: record.accessCount }, 'Promoted memory to hot tier');
        }
    }
}
/**
 * Check if a memory should be demoted from hot tier
 */
export function shouldDemote(record) {
    if (record.tier !== 'hot')
        return false;
    const now = Date.now();
    const demotionThreshold = config.demotionDays * 24 * 60 * 60 * 1000;
    return now - record.lastAccessedAt > demotionThreshold;
}
/**
 * Run demotion check for all hot tier items
 * Call this periodically (e.g., hourly) via background worker
 */
export async function runDemotionCheck() {
    if (!config.enabled)
        return { demoted: 0 };
    let demoted = 0;
    for (const [key, record] of accessRecords.entries()) {
        if (shouldDemote(record)) {
            const success = await removeFromHotTier(record.userId, record.memoryId);
            if (success) {
                demoted++;
                stats.demotions++;
                log.info({ userId: record.userId, memoryId: record.memoryId }, 'Demoted memory from hot tier');
            }
        }
    }
    return { demoted };
}
// ============================================================================
// TIERED RETRIEVAL
// ============================================================================
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
export async function getMemoryTiered(userId, memoryId, warmTierFetcher) {
    // 1. Try hot tier first
    const hotResult = await getFromHotTier(userId, memoryId);
    if (hotResult) {
        // Still record access to keep track of frequency
        await recordMemoryAccess(userId, hotResult);
        return hotResult;
    }
    // 2. Fall back to warm tier
    const warmStart = Date.now();
    const warmResult = await warmTierFetcher();
    const warmLatency = Date.now() - warmStart;
    recordLatency('warm', warmLatency);
    if (warmResult) {
        // Record access for potential promotion
        await recordMemoryAccess(userId, warmResult);
        log.debug({ userId, memoryId, latencyMs: warmLatency }, 'Warm tier fetch');
        return warmResult;
    }
    return null;
}
/**
 * Retrieve multiple memories using tiered storage.
 * Checks hot tier for all, then batch fetches missing from warm tier.
 */
export async function getMemoriesTiered(userId, memoryIds, warmTierBatchFetcher) {
    const result = new Map();
    const missingIds = [];
    // 1. Check hot tier for each
    await Promise.all(memoryIds.map(async (id) => {
        const hotResult = await getFromHotTier(userId, id);
        if (hotResult) {
            result.set(id, hotResult);
            // Record access
            await recordMemoryAccess(userId, hotResult);
        }
        else {
            missingIds.push(id);
        }
    }));
    // 2. Batch fetch missing from warm tier
    if (missingIds.length > 0) {
        const warmStart = Date.now();
        const warmResults = await warmTierBatchFetcher(missingIds);
        const warmLatency = Date.now() - warmStart;
        recordLatency('warm', warmLatency);
        for (const [id, memory] of warmResults) {
            result.set(id, memory);
            // Record access for potential promotion
            await recordMemoryAccess(userId, memory);
        }
        log.debug({
            userId,
            hotHits: memoryIds.length - missingIds.length,
            warmFetched: warmResults.size,
            warmLatencyMs: warmLatency,
        }, 'Tiered batch fetch');
    }
    return result;
}
// ============================================================================
// METRICS & CLEANUP
// ============================================================================
/**
 * Get tiered memory stats for monitoring
 */
export function getTieredMemoryStats() {
    return { ...stats };
}
/**
 * Reset stats (for testing)
 */
export function resetTieredMemoryStats() {
    stats.hotTierSize = 0;
    stats.hotTierHits = 0;
    stats.hotTierMisses = 0;
    stats.promotions = 0;
    stats.demotions = 0;
    stats.avgHotTierLatencyMs = 0;
    stats.avgWarmTierLatencyMs = 0;
    latencyHistory.hot = [];
    latencyHistory.warm = [];
}
/**
 * Clear all access records (for testing)
 */
export function clearAccessRecords() {
    accessRecords.clear();
}
/**
 * Get access records for a user (for debugging)
 */
export function getUserAccessRecords(userId) {
    const records = [];
    for (const [key, record] of accessRecords) {
        if (key.startsWith(`${userId}:`)) {
            records.push(record);
        }
    }
    return records;
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    storeInHotTier,
    getFromHotTier,
    removeFromHotTier,
    recordMemoryAccess,
    runDemotionCheck,
    getMemoryTiered,
    getMemoriesTiered,
    getTieredMemoryStats,
    resetTieredMemoryStats,
    clearAccessRecords,
    getUserAccessRecords,
    setTieredMemoryConfig,
    getTieredMemoryConfig,
};
//# sourceMappingURL=tiered-memory-storage.js.map