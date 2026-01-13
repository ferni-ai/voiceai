/**
 * Redis Cache Layer
 *
 * Fast, ephemeral caching for session data using Redis.
 * Works with Google Cloud Memorystore for Redis in production.
 *
 * GRACEFUL DEGRADATION:
 * All cache operations fail silently and return sensible defaults when Redis
 * is unavailable. This ensures the application continues working without cache.
 *
 * Requires: npm install ioredis
 *
 * Environment:
 * - REDIS_URL: Redis connection string (e.g., redis://localhost:6379)
 * - REDIS_HOST: Redis host (alternative to URL)
 * - REDIS_PORT: Redis port (default: 6379)
 * - REDIS_PASSWORD: Redis password (if required)
 */
/**
 * Session cache data structure
 */
type SessionCacheData = Record<string, unknown>;
interface RedisConfig {
    url?: string;
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
    maxRetriesPerRequest?: number;
    enableReadyCheck?: boolean;
    connectTimeout?: number;
}
/**
 * Redis-based cache for session data
 *
 * Key patterns:
 * - session:{sessionId} - Session data (JSON)
 * - session:{sessionId}:turns - Conversation turns (list)
 * - session:{sessionId}:analysis - Latest analysis (JSON)
 * - user:{userId}:session - Current session ID
 * - rate:{userId} - Rate limiting counter
 */
export declare class RedisCache {
    private client;
    private config;
    private initialized;
    private initPromise;
    private readonly SESSION_TTL;
    private readonly ANALYSIS_TTL;
    private readonly RATE_TTL;
    private readonly PRESENCE_TTL;
    private readonly EMOTION_TTL;
    private readonly BIOMARKER_TTL;
    private readonly OUTREACH_SUPPRESS_TTL;
    private lastWarningTime;
    private warningCount;
    private readonly WARNING_INTERVAL_MS;
    private readonly WARNING_BATCH_SIZE;
    constructor(config?: RedisConfig);
    /**
     * Initialize Redis connection
     */
    initialize(): Promise<void>;
    private doInitialize;
    /**
     * Check if connected
     */
    isConnected(): boolean;
    /**
     * Store session data
     * Fails silently if Redis unavailable - cache is optional
     */
    setSession(sessionId: string, data: SessionCacheData, ttlSeconds?: number): Promise<boolean>;
    /**
     * Get session data
     * Returns null if Redis unavailable or error - caller handles cache miss
     */
    getSession(sessionId: string): Promise<SessionCacheData | null>;
    /**
     * Delete session data
     * Fails silently if Redis unavailable
     */
    deleteSession(sessionId: string): Promise<boolean>;
    /**
     * Extend session TTL
     * Fails silently if Redis unavailable
     */
    extendSession(sessionId: string, ttlSeconds?: number): Promise<boolean>;
    /**
     * Add a conversation turn
     * Fails silently if Redis unavailable
     */
    addTurn(sessionId: string, turn: {
        role: string;
        content: string;
        timestamp: Date;
    }): Promise<boolean>;
    /**
     * Get recent turns
     * Returns empty array if Redis unavailable
     */
    getRecentTurns(sessionId: string, count?: number): Promise<Array<{
        role: string;
        content: string;
        timestamp: Date;
    }>>;
    /**
     * Get turn count
     * Returns 0 if Redis unavailable
     */
    getTurnCount(sessionId: string): Promise<number>;
    /**
     * Cache analysis results
     * Fails silently if Redis unavailable
     */
    cacheAnalysis(sessionId: string, analysis: Record<string, unknown>): Promise<boolean>;
    /**
     * Get cached analysis
     * Returns null if Redis unavailable
     */
    getCachedAnalysis(sessionId: string): Promise<Record<string, unknown> | null>;
    /**
     * Map user to current session
     * Fails silently if Redis unavailable
     */
    setUserSession(userId: string, sessionId: string): Promise<boolean>;
    /**
     * Get user's current session
     * Returns null if Redis unavailable
     */
    getUserSession(userId: string): Promise<string | null>;
    /**
     * Increment rate counter and check limit
     * Returns allowed=true if Redis unavailable (fail-open for availability)
     */
    checkRateLimit(userId: string, limit?: number): Promise<{
        allowed: boolean;
        current: number;
        remaining: number;
    }>;
    /**
     * Rate-limited warning logger to prevent log spam during Redis outages
     */
    private logWarningRateLimited;
    private static readonly SILENT_FAIL_KEY_PREFIXES;
    /**
     * Check if a key is non-critical and should fail silently
     */
    private shouldFailSilently;
    /**
     * Set a value with optional TTL
     * Fails silently if Redis unavailable
     */
    set(key: string, value: unknown, ttlSeconds?: number): Promise<boolean>;
    /**
     * Get a value
     * Returns null if Redis unavailable
     */
    get<T = unknown>(key: string): Promise<T | null>;
    /**
     * Delete a key
     * Fails silently if Redis unavailable
     */
    delete(key: string): Promise<boolean>;
    /**
     * Check if key exists
     * Returns false if Redis unavailable
     */
    exists(key: string): Promise<boolean>;
    /**
     * Increment a counter
     * Returns 0 if Redis unavailable
     */
    incr(key: string): Promise<number>;
    /**
     * Set TTL on a key
     * Returns false if Redis unavailable
     */
    expire(key: string, seconds: number): Promise<boolean>;
    /**
     * Store user's current emotional state (detected from voice/conversation)
     * Key: emotion:{userId}
     */
    setEmotionalState(userId: string, state: {
        primary: string;
        secondary?: string;
        intensity: number;
        confidence: number;
        triggers?: string[];
        timestamp: string;
    }): Promise<boolean>;
    /**
     * Get user's current emotional state
     */
    getEmotionalState(userId: string): Promise<{
        primary: string;
        secondary?: string;
        intensity: number;
        confidence: number;
        triggers?: string[];
        timestamp: string;
    } | null>;
    /**
     * Store recent voice biomarker readings (very transient)
     * Key: biomarker:{userId}
     */
    setVoiceBiomarker(userId: string, biomarker: {
        fatigue: number;
        stress: number;
        hydration?: number;
        pitch?: 'low' | 'normal' | 'high' | 'variable';
        pace?: 'slow' | 'normal' | 'fast' | 'rushed';
        strain?: boolean;
        timestamp: string;
    }): Promise<boolean>;
    /**
     * Get recent voice biomarker
     */
    getVoiceBiomarker(userId: string): Promise<{
        fatigue: number;
        stress: number;
        hydration?: number;
        pitch?: 'low' | 'normal' | 'high' | 'variable';
        pace?: 'slow' | 'normal' | 'fast' | 'rushed';
        strain?: boolean;
        timestamp: string;
    } | null>;
    /**
     * Set user presence (call periodically during session as heartbeat)
     * Key: presence:{userId}
     */
    setUserPresence(userId: string, presence: {
        sessionId: string;
        personaId: string;
        startedAt: string;
        lastHeartbeat: string;
        channel?: 'voice' | 'text' | 'web';
    }): Promise<boolean>;
    /**
     * Check if user is currently in a session
     */
    getUserPresence(userId: string): Promise<{
        sessionId: string;
        personaId: string;
        startedAt: string;
        lastHeartbeat: string;
        channel?: 'voice' | 'text' | 'web';
    } | null>;
    /**
     * Clear user presence (on session end)
     */
    clearUserPresence(userId: string): Promise<boolean>;
    /**
     * Check if user is currently active (convenience method)
     */
    isUserActive(userId: string): Promise<boolean>;
    /**
     * Suppress outreach for a user (e.g., just finished a session)
     * Key: suppress_outreach:{userId}
     */
    suppressOutreach(userId: string, reason: string, durationSeconds?: number): Promise<boolean>;
    /**
     * Check if outreach is suppressed
     */
    isOutreachSuppressed(userId: string): Promise<{
        suppressed: boolean;
        reason?: string;
        until?: string;
    }>;
    /**
     * Clear outreach suppression
     */
    clearOutreachSuppression(userId: string): Promise<boolean>;
    private readonly TOOL_FAILURE_TTL;
    /**
     * Record a tool failure for the current session
     * Key: tool_failure:{sessionId}
     */
    recordToolFailure(sessionId: string, failure: {
        toolName: string;
        error: string;
        timestamp: string;
        attemptedAction?: string;
    }): Promise<boolean>;
    /**
     * Get recent tool failures for a session
     */
    getRecentToolFailures(sessionId: string): Promise<Array<{
        toolName: string;
        error: string;
        timestamp: string;
        attemptedAction?: string;
    }>>;
    /**
     * Clear tool failures for a session (after acknowledging them)
     */
    clearToolFailures(sessionId: string): Promise<boolean>;
    /**
     * Cache persona affinity scores for fast routing decisions
     * Key: affinity:{userId}
     */
    setPersonaAffinityCache(userId: string, affinities: Array<{
        personaId: string;
        score: number;
        topTopics: string[];
    }>): Promise<boolean>;
    /**
     * Get cached persona affinities
     */
    getPersonaAffinityCache(userId: string): Promise<Array<{
        personaId: string;
        score: number;
        topTopics: string[];
    }> | null>;
    /**
     * Get best persona for a topic (uses cached affinity)
     */
    getBestPersonaForTopic(userId: string, topic: string): Promise<{
        personaId: string;
        score: number;
    } | null>;
    /**
     * Store active call state (for outbound calls)
     * Key: call:{callId}
     */
    setActiveCall(callId: string, callState: {
        userId: string;
        contactName?: string;
        purpose: string;
        startedAt: string;
        status: 'connecting' | 'in_progress' | 'wrapping_up';
        personaId: string;
    }): Promise<boolean>;
    /**
     * Get active call state
     */
    getActiveCall(callId: string): Promise<{
        userId: string;
        contactName?: string;
        purpose: string;
        startedAt: string;
        status: 'connecting' | 'in_progress' | 'wrapping_up';
        personaId: string;
    } | null>;
    /**
     * Update call status
     */
    updateCallStatus(callId: string, status: 'connecting' | 'in_progress' | 'wrapping_up'): Promise<boolean>;
    /**
     * End call (remove from cache)
     */
    endCall(callId: string): Promise<boolean>;
    /**
     * Set a value with gzip compression
     * Useful for large JSON payloads (embeddings, conversation history, etc.)
     * Fails silently if Redis unavailable
     */
    setCompressed(key: string, value: unknown, ttlSeconds?: number): Promise<boolean>;
    /**
     * Get a compressed value and decompress
     * Returns null if Redis unavailable or decompression fails
     */
    getCompressed<T = unknown>(key: string): Promise<T | null>;
    /**
     * Set session data with compression (for large session payloads)
     * Fails silently if Redis unavailable
     */
    setSessionCompressed(sessionId: string, data: SessionCacheData, ttlSeconds?: number): Promise<boolean>;
    /**
     * Get compressed session data
     * Returns null if Redis unavailable
     */
    getSessionCompressed(sessionId: string): Promise<SessionCacheData | null>;
    /**
     * Close Redis connection
     */
    close(): Promise<void>;
}
/**
 * Get the singleton Redis cache instance (thread-safe)
 * Uses promise-based lazy initialization to prevent race conditions
 * where multiple concurrent calls could create multiple instances.
 */
export declare function getRedisCache(config?: RedisConfig): RedisCache;
/**
 * Get Redis cache with async initialization (for cases needing full init)
 * Ensures only one instance is created even under concurrent access.
 */
export declare function getRedisCacheAsync(config?: RedisConfig): Promise<RedisCache>;
/**
 * Reset the Redis cache (for testing)
 */
export declare function resetRedisCache(): Promise<void>;
export default RedisCache;
//# sourceMappingURL=redis-cache.d.ts.map