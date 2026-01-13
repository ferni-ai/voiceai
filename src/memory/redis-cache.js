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
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { getLogger } from '../utils/safe-logger.js';
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
// ============================================================================
// REDIS CACHE
// ============================================================================
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
export class RedisCache {
    client = null;
    config;
    initialized = false;
    // FIX: Cache initialization promise to prevent race conditions
    initPromise = null;
    // Default TTLs
    SESSION_TTL = 3600; // 1 hour
    ANALYSIS_TTL = 300; // 5 minutes
    RATE_TTL = 60; // 1 minute
    PRESENCE_TTL = 120; // 2 minutes (heartbeat)
    EMOTION_TTL = 300; // 5 minutes
    BIOMARKER_TTL = 60; // 1 minute (very transient)
    OUTREACH_SUPPRESS_TTL = 1800; // 30 minutes after session
    // Log rate-limiting to prevent spam during Redis outages
    lastWarningTime = 0;
    warningCount = 0;
    WARNING_INTERVAL_MS = 60_000; // Only log once per minute
    WARNING_BATCH_SIZE = 10; // After this many, batch them
    constructor(config) {
        this.config = config || {
            url: process.env.REDIS_URL,
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            password: process.env.REDIS_PASSWORD,
            keyPrefix: 'bogle:',
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            connectTimeout: 10000,
        };
    }
    /**
     * Initialize Redis connection
     */
    async initialize() {
        if (this.initialized)
            return;
        // Return cached promise if initialization is in progress
        if (this.initPromise) {
            return this.initPromise;
        }
        // Start initialization and cache the promise
        this.initPromise = this.doInitialize();
        try {
            await this.initPromise;
        }
        finally {
            this.initPromise = null;
        }
    }
    async doInitialize() {
        try {
            // Dynamic import of ioredis
            const Redis = (await import('ioredis')).default;
            let redisClient;
            if (this.config.url) {
                redisClient = new Redis(this.config.url, {
                    keyPrefix: this.config.keyPrefix,
                    maxRetriesPerRequest: this.config.maxRetriesPerRequest,
                    enableReadyCheck: this.config.enableReadyCheck,
                    lazyConnect: true, // Don't connect immediately, we'll test connection manually
                });
            }
            else {
                redisClient = new Redis({
                    host: this.config.host,
                    port: this.config.port,
                    password: this.config.password,
                    db: this.config.db,
                    keyPrefix: this.config.keyPrefix,
                    maxRetriesPerRequest: this.config.maxRetriesPerRequest,
                    enableReadyCheck: this.config.enableReadyCheck,
                    lazyConnect: true, // Don't connect immediately, we'll test connection manually
                });
            }
            // CRITICAL: Add error handler to prevent "Unhandled error event" crashes
            // This is required by ioredis when Redis is not available locally
            // FIX: Throttle error logging to prevent log spam (log once every 60 seconds per error type)
            const loggedErrors = new Map();
            const ERROR_LOG_THROTTLE_MS = 60000; // 60 seconds
            redisClient.on('error', (error) => {
                const errorKey = String(error).split(':')[0]; // Group by error type (e.g., "AggregateError")
                const lastLogged = loggedErrors.get(errorKey) || 0;
                const now = Date.now();
                if (now - lastLogged > ERROR_LOG_THROTTLE_MS) {
                    loggedErrors.set(errorKey, now);
                    getLogger().debug({ error: String(error) }, 'Redis connection error (non-blocking, throttled)');
                }
                // Silently ignore repeated errors within the throttle window
            });
            this.client = redisClient;
            // Test connection - will throw if Redis unavailable
            await redisClient.connect();
            await this.client.ping();
            this.initialized = true;
            getLogger().info('Redis cache initialized successfully');
        }
        catch (error) {
            getLogger().error(`Redis initialization failed: ${error}`);
            throw error;
        }
    }
    /**
     * Check if connected
     */
    isConnected() {
        return this.initialized && this.client !== null;
    }
    // ============================================================================
    // SESSION MANAGEMENT
    // ============================================================================
    /**
     * Store session data
     * Fails silently if Redis unavailable - cache is optional
     */
    async setSession(sessionId, data, ttlSeconds) {
        if (!this.client) {
            getLogger().debug('Redis unavailable, skipping session cache');
            return false;
        }
        try {
            const key = `session:${sessionId}`;
            const value = JSON.stringify(data);
            await this.client.setex(key, ttlSeconds || this.SESSION_TTL, value);
            getLogger().debug(`Cached session: ${sessionId}`);
            return true;
        }
        catch (error) {
            getLogger().warn({ error: String(error), sessionId }, 'Failed to cache session (non-blocking)');
            return false;
        }
    }
    /**
     * Get session data
     * Returns null if Redis unavailable or error - caller handles cache miss
     */
    async getSession(sessionId) {
        if (!this.client) {
            return null;
        }
        try {
            const key = `session:${sessionId}`;
            const value = await this.client.get(key);
            if (!value)
                return null;
            return JSON.parse(value);
        }
        catch (error) {
            getLogger().warn({ error: String(error), sessionId }, 'Failed to get cached session (non-blocking)');
            return null;
        }
    }
    /**
     * Delete session data
     * Fails silently if Redis unavailable
     */
    async deleteSession(sessionId) {
        if (!this.client) {
            return false;
        }
        try {
            const keys = await this.client.keys(`session:${sessionId}*`);
            if (keys.length > 0) {
                await this.client.del(keys);
            }
            getLogger().debug(`Deleted session: ${sessionId}`);
            return true;
        }
        catch (error) {
            getLogger().warn({ error: String(error), sessionId }, 'Failed to delete session (non-blocking)');
            return false;
        }
    }
    /**
     * Extend session TTL
     * Fails silently if Redis unavailable
     */
    async extendSession(sessionId, ttlSeconds) {
        if (!this.client) {
            return false;
        }
        try {
            const key = `session:${sessionId}`;
            await this.client.expire(key, ttlSeconds || this.SESSION_TTL);
            return true;
        }
        catch (error) {
            getLogger().warn({ error: String(error), sessionId }, 'Failed to extend session TTL (non-blocking)');
            return false;
        }
    }
    // ============================================================================
    // CONVERSATION TURNS
    // ============================================================================
    /**
     * Add a conversation turn
     * Fails silently if Redis unavailable
     */
    async addTurn(sessionId, turn) {
        if (!this.client) {
            return false;
        }
        try {
            const key = `session:${sessionId}:turns`;
            await this.client.rpush(key, JSON.stringify(turn));
            await this.client.expire(key, this.SESSION_TTL);
            // Keep only last 100 turns
            await this.client.ltrim(key, -100, -1);
            return true;
        }
        catch (error) {
            getLogger().warn({ error: String(error), sessionId }, 'Failed to add turn to cache (non-blocking)');
            return false;
        }
    }
    /**
     * Get recent turns
     * Returns empty array if Redis unavailable
     */
    async getRecentTurns(sessionId, count = 20) {
        if (!this.client) {
            return [];
        }
        try {
            const key = `session:${sessionId}:turns`;
            const turns = await this.client.lrange(key, -count, -1);
            return turns.map((t) => {
                const parsed = JSON.parse(t);
                parsed.timestamp = new Date(parsed.timestamp);
                return parsed;
            });
        }
        catch (error) {
            getLogger().warn({ error: String(error), sessionId }, 'Failed to get cached turns (non-blocking)');
            return [];
        }
    }
    /**
     * Get turn count
     * Returns 0 if Redis unavailable
     */
    async getTurnCount(sessionId) {
        if (!this.client) {
            return 0;
        }
        try {
            const key = `session:${sessionId}:turns`;
            const turns = await this.client.lrange(key, 0, -1);
            return turns.length;
        }
        catch (error) {
            getLogger().warn({ error: String(error), sessionId }, 'Failed to get turn count (non-blocking)');
            return 0;
        }
    }
    // ============================================================================
    // ANALYSIS CACHING
    // ============================================================================
    /**
     * Cache analysis results
     * Fails silently if Redis unavailable
     */
    async cacheAnalysis(sessionId, analysis) {
        if (!this.client) {
            return false;
        }
        try {
            const key = `session:${sessionId}:analysis`;
            await this.client.setex(key, this.ANALYSIS_TTL, JSON.stringify(analysis));
            return true;
        }
        catch (error) {
            getLogger().warn({ error: String(error), sessionId }, 'Failed to cache analysis (non-blocking)');
            return false;
        }
    }
    /**
     * Get cached analysis
     * Returns null if Redis unavailable
     */
    async getCachedAnalysis(sessionId) {
        if (!this.client) {
            return null;
        }
        try {
            const key = `session:${sessionId}:analysis`;
            const value = await this.client.get(key);
            if (!value)
                return null;
            return JSON.parse(value);
        }
        catch (error) {
            getLogger().warn({ error: String(error), sessionId }, 'Failed to get cached analysis (non-blocking)');
            return null;
        }
    }
    // ============================================================================
    // USER SESSION MAPPING
    // ============================================================================
    /**
     * Map user to current session
     * Fails silently if Redis unavailable
     */
    async setUserSession(userId, sessionId) {
        if (!this.client) {
            return false;
        }
        try {
            const key = `user:${userId}:session`;
            await this.client.setex(key, this.SESSION_TTL, sessionId);
            return true;
        }
        catch (error) {
            getLogger().warn({ error: String(error), userId }, 'Failed to set user session (non-blocking)');
            return false;
        }
    }
    /**
     * Get user's current session
     * Returns null if Redis unavailable
     */
    async getUserSession(userId) {
        if (!this.client) {
            return null;
        }
        try {
            const key = `user:${userId}:session`;
            return await this.client.get(key);
        }
        catch (error) {
            getLogger().warn({ error: String(error), userId }, 'Failed to get user session (non-blocking)');
            return null;
        }
    }
    // ============================================================================
    // RATE LIMITING
    // ============================================================================
    /**
     * Increment rate counter and check limit
     * Returns allowed=true if Redis unavailable (fail-open for availability)
     */
    async checkRateLimit(userId, limit = 60) {
        if (!this.client) {
            // Fail open - allow request when cache unavailable
            return { allowed: true, current: 0, remaining: limit };
        }
        try {
            const key = `rate:${userId}`;
            const current = await this.client.incr(key);
            // Set TTL on first increment
            if (current === 1) {
                await this.client.expire(key, this.RATE_TTL);
            }
            return {
                allowed: current <= limit,
                current,
                remaining: Math.max(0, limit - current),
            };
        }
        catch (error) {
            getLogger().warn({ error: String(error), userId }, 'Rate limit check failed (fail-open)');
            // Fail open - allow request when cache unavailable
            return { allowed: true, current: 0, remaining: limit };
        }
    }
    // ============================================================================
    // GENERIC OPERATIONS (all fail silently for graceful degradation)
    // ============================================================================
    /**
     * Rate-limited warning logger to prevent log spam during Redis outages
     */
    logWarningRateLimited(context, message) {
        const now = Date.now();
        this.warningCount++;
        // Reset counter if we're in a new time window
        if (now - this.lastWarningTime > this.WARNING_INTERVAL_MS) {
            if (this.warningCount > this.WARNING_BATCH_SIZE) {
                // Log a summary of suppressed warnings
                getLogger().warn({ suppressedCount: this.warningCount - 1, windowMs: this.WARNING_INTERVAL_MS }, 'Redis cache warnings suppressed (rate-limited)');
            }
            this.warningCount = 1;
            this.lastWarningTime = now;
            getLogger().warn(context, message);
        }
        else if (this.warningCount <= this.WARNING_BATCH_SIZE) {
            // Log first few warnings
            getLogger().warn(context, message);
        }
        // Otherwise, suppress the log
    }
    // Keys that are non-critical and should fail completely silently
    static SILENT_FAIL_KEY_PREFIXES = [
        'presence:', // Presence tracking is nice-to-have, not critical
        'biomarker:', // Voice biomarkers are supplementary
        'emotion:', // Emotion state is cached but not critical
    ];
    /**
     * Check if a key is non-critical and should fail silently
     */
    shouldFailSilently(key) {
        return RedisCache.SILENT_FAIL_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
    }
    /**
     * Set a value with optional TTL
     * Fails silently if Redis unavailable
     */
    async set(key, value, ttlSeconds) {
        if (!this.client) {
            return false;
        }
        try {
            const serialized = typeof value === 'string' ? value : JSON.stringify(value);
            if (ttlSeconds) {
                await this.client.setex(key, ttlSeconds, serialized);
            }
            else {
                await this.client.set(key, serialized);
            }
            return true;
        }
        catch (error) {
            // Skip logging for non-critical keys to reduce noise
            if (!this.shouldFailSilently(key)) {
                // Use rate-limited logging to prevent spam during Redis outages
                this.logWarningRateLimited({ error: String(error), key }, 'Failed to set cache value (non-blocking)');
            }
            return false;
        }
    }
    /**
     * Get a value
     * Returns null if Redis unavailable
     */
    async get(key) {
        if (!this.client) {
            return null;
        }
        try {
            const value = await this.client.get(key);
            if (!value)
                return null;
            try {
                return JSON.parse(value);
            }
            catch {
                return value;
            }
        }
        catch (error) {
            getLogger().warn({ error: String(error), key }, 'Failed to get cache value (non-blocking)');
            return null;
        }
    }
    /**
     * Delete a key
     * Fails silently if Redis unavailable
     */
    async delete(key) {
        if (!this.client) {
            return false;
        }
        try {
            const result = await this.client.del(key);
            return result > 0;
        }
        catch (error) {
            getLogger().warn({ error: String(error), key }, 'Failed to delete cache key (non-blocking)');
            return false;
        }
    }
    /**
     * Check if key exists
     * Returns false if Redis unavailable
     */
    async exists(key) {
        if (!this.client) {
            return false;
        }
        try {
            const result = await this.client.exists(key);
            return result > 0;
        }
        catch (error) {
            getLogger().warn({ error: String(error), key }, 'Failed to check cache key existence (non-blocking)');
            return false;
        }
    }
    /**
     * Increment a counter
     * Returns 0 if Redis unavailable
     */
    async incr(key) {
        if (!this.client) {
            return 0;
        }
        try {
            return await this.client.incr(key);
        }
        catch (error) {
            getLogger().warn({ error: String(error), key }, 'Failed to increment counter (non-blocking)');
            return 0;
        }
    }
    /**
     * Set TTL on a key
     * Returns false if Redis unavailable
     */
    async expire(key, seconds) {
        if (!this.client) {
            return false;
        }
        try {
            const result = await this.client.expire(key, seconds);
            return result > 0;
        }
        catch (error) {
            getLogger().warn({ error: String(error), key }, 'Failed to set TTL (non-blocking)');
            return false;
        }
    }
    // ============================================================================
    // REAL-TIME EMOTIONAL STATE
    // ============================================================================
    /**
     * Store user's current emotional state (detected from voice/conversation)
     * Key: emotion:{userId}
     */
    async setEmotionalState(userId, state) {
        if (!this.client)
            return false;
        try {
            const key = `emotion:${userId}`;
            await this.client.setex(key, this.EMOTION_TTL, JSON.stringify(state));
            return true;
        }
        catch (error) {
            getLogger().warn({ error: String(error), userId }, 'Failed to set emotional state');
            return false;
        }
    }
    /**
     * Get user's current emotional state
     */
    async getEmotionalState(userId) {
        if (!this.client)
            return null;
        try {
            const key = `emotion:${userId}`;
            const value = await this.client.get(key);
            return value ? JSON.parse(value) : null;
        }
        catch {
            return null;
        }
    }
    // ============================================================================
    // VOICE BIOMARKERS (Transient)
    // ============================================================================
    /**
     * Store recent voice biomarker readings (very transient)
     * Key: biomarker:{userId}
     */
    async setVoiceBiomarker(userId, biomarker) {
        if (!this.client)
            return false;
        try {
            const key = `biomarker:${userId}`;
            await this.client.setex(key, this.BIOMARKER_TTL, JSON.stringify(biomarker));
            return true;
        }
        catch (error) {
            getLogger().warn({ error: String(error), userId }, 'Failed to set voice biomarker');
            return false;
        }
    }
    /**
     * Get recent voice biomarker
     */
    async getVoiceBiomarker(userId) {
        if (!this.client)
            return null;
        try {
            const key = `biomarker:${userId}`;
            const value = await this.client.get(key);
            return value ? JSON.parse(value) : null;
        }
        catch {
            return null;
        }
    }
    // ============================================================================
    // USER PRESENCE (Is user currently in a session?)
    // ============================================================================
    /**
     * Set user presence (call periodically during session as heartbeat)
     * Key: presence:{userId}
     */
    async setUserPresence(userId, presence) {
        if (!this.client)
            return false;
        try {
            const key = `presence:${userId}`;
            await this.client.setex(key, this.PRESENCE_TTL, JSON.stringify(presence));
            return true;
        }
        catch (error) {
            getLogger().warn({ error: String(error), userId }, 'Failed to set presence');
            return false;
        }
    }
    /**
     * Check if user is currently in a session
     */
    async getUserPresence(userId) {
        if (!this.client)
            return null;
        try {
            const key = `presence:${userId}`;
            const value = await this.client.get(key);
            return value ? JSON.parse(value) : null;
        }
        catch {
            return null;
        }
    }
    /**
     * Clear user presence (on session end)
     */
    async clearUserPresence(userId) {
        if (!this.client)
            return false;
        try {
            const key = `presence:${userId}`;
            await this.client.del(key);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Check if user is currently active (convenience method)
     */
    async isUserActive(userId) {
        const presence = await this.getUserPresence(userId);
        return presence !== null;
    }
    // ============================================================================
    // OUTREACH SUPPRESSION
    // ============================================================================
    /**
     * Suppress outreach for a user (e.g., just finished a session)
     * Key: suppress_outreach:{userId}
     */
    async suppressOutreach(userId, reason, durationSeconds) {
        if (!this.client)
            return false;
        try {
            const key = `suppress_outreach:${userId}`;
            const data = {
                reason,
                until: new Date(Date.now() + (durationSeconds || this.OUTREACH_SUPPRESS_TTL) * 1000).toISOString(),
                setAt: new Date().toISOString(),
            };
            await this.client.setex(key, durationSeconds || this.OUTREACH_SUPPRESS_TTL, JSON.stringify(data));
            getLogger().debug({ userId, reason }, 'Outreach suppressed');
            return true;
        }
        catch (error) {
            getLogger().warn({ error: String(error), userId }, 'Failed to suppress outreach');
            return false;
        }
    }
    /**
     * Check if outreach is suppressed
     */
    async isOutreachSuppressed(userId) {
        if (!this.client)
            return { suppressed: false };
        try {
            const key = `suppress_outreach:${userId}`;
            const value = await this.client.get(key);
            if (!value)
                return { suppressed: false };
            const data = JSON.parse(value);
            return { suppressed: true, reason: data.reason, until: data.until };
        }
        catch {
            return { suppressed: false };
        }
    }
    /**
     * Clear outreach suppression
     */
    async clearOutreachSuppression(userId) {
        if (!this.client)
            return false;
        try {
            const key = `suppress_outreach:${userId}`;
            await this.client.del(key);
            return true;
        }
        catch {
            return false;
        }
    }
    // ============================================================================
    // TOOL FAILURE TRACKING (for LLM feedback)
    // ============================================================================
    TOOL_FAILURE_TTL = 30; // 30 seconds - very short, just for current turn
    /**
     * Record a tool failure for the current session
     * Key: tool_failure:{sessionId}
     */
    async recordToolFailure(sessionId, failure) {
        if (!this.client)
            return false;
        try {
            const key = `tool_failure:${sessionId}`;
            const existing = await this.client.get(key);
            const failures = existing ? JSON.parse(existing) : [];
            // Add new failure (keep max 5 recent)
            failures.push(failure);
            if (failures.length > 5) {
                failures.shift();
            }
            await this.client.setex(key, this.TOOL_FAILURE_TTL, JSON.stringify(failures));
            return true;
        }
        catch (error) {
            getLogger().warn({ error: String(error), sessionId }, 'Failed to record tool failure');
            return false;
        }
    }
    /**
     * Get recent tool failures for a session
     */
    async getRecentToolFailures(sessionId) {
        if (!this.client)
            return [];
        try {
            const key = `tool_failure:${sessionId}`;
            const value = await this.client.get(key);
            return value ? JSON.parse(value) : [];
        }
        catch {
            return [];
        }
    }
    /**
     * Clear tool failures for a session (after acknowledging them)
     */
    async clearToolFailures(sessionId) {
        if (!this.client)
            return false;
        try {
            const key = `tool_failure:${sessionId}`;
            await this.client.del(key);
            return true;
        }
        catch {
            return false;
        }
    }
    // ============================================================================
    // PERSONA AFFINITY CACHE (Hot Path for Routing)
    // ============================================================================
    /**
     * Cache persona affinity scores for fast routing decisions
     * Key: affinity:{userId}
     */
    async setPersonaAffinityCache(userId, affinities) {
        if (!this.client)
            return false;
        try {
            const key = `affinity:${userId}`;
            await this.client.setex(key, this.SESSION_TTL, JSON.stringify(affinities));
            return true;
        }
        catch (error) {
            getLogger().warn({ error: String(error), userId }, 'Failed to cache persona affinity');
            return false;
        }
    }
    /**
     * Get cached persona affinities
     */
    async getPersonaAffinityCache(userId) {
        if (!this.client)
            return null;
        try {
            const key = `affinity:${userId}`;
            const value = await this.client.get(key);
            return value ? JSON.parse(value) : null;
        }
        catch {
            return null;
        }
    }
    /**
     * Get best persona for a topic (uses cached affinity)
     */
    async getBestPersonaForTopic(userId, topic) {
        const affinities = await this.getPersonaAffinityCache(userId);
        if (!affinities)
            return null;
        const topicLower = topic.toLowerCase();
        let best = null;
        for (const affinity of affinities) {
            const hasMatchingTopic = affinity.topTopics.some((t) => t.toLowerCase().includes(topicLower) || topicLower.includes(t.toLowerCase()));
            if (hasMatchingTopic) {
                if (!best || affinity.score > best.score) {
                    best = { personaId: affinity.personaId, score: affinity.score };
                }
            }
        }
        return best;
    }
    // ============================================================================
    // ACTIVE CALL STATE
    // ============================================================================
    /**
     * Store active call state (for outbound calls)
     * Key: call:{callId}
     */
    async setActiveCall(callId, callState) {
        if (!this.client)
            return false;
        try {
            const key = `call:${callId}`;
            await this.client.setex(key, 3600, JSON.stringify(callState)); // 1 hour max
            return true;
        }
        catch (error) {
            getLogger().warn({ error: String(error), callId }, 'Failed to set active call');
            return false;
        }
    }
    /**
     * Get active call state
     */
    async getActiveCall(callId) {
        if (!this.client)
            return null;
        try {
            const key = `call:${callId}`;
            const value = await this.client.get(key);
            return value ? JSON.parse(value) : null;
        }
        catch {
            return null;
        }
    }
    /**
     * Update call status
     */
    async updateCallStatus(callId, status) {
        if (!this.client)
            return false;
        try {
            const call = await this.getActiveCall(callId);
            if (!call)
                return false;
            call.status = status;
            return this.setActiveCall(callId, call);
        }
        catch {
            return false;
        }
    }
    /**
     * End call (remove from cache)
     */
    async endCall(callId) {
        if (!this.client)
            return false;
        try {
            const key = `call:${callId}`;
            await this.client.del(key);
            return true;
        }
        catch {
            return false;
        }
    }
    // ============================================================================
    // COMPRESSED OPERATIONS (for large payloads)
    // ============================================================================
    /**
     * Set a value with gzip compression
     * Useful for large JSON payloads (embeddings, conversation history, etc.)
     * Fails silently if Redis unavailable
     */
    async setCompressed(key, value, ttlSeconds) {
        if (!this.client) {
            return false;
        }
        try {
            const serialized = typeof value === 'string' ? value : JSON.stringify(value);
            const compressed = await gzipAsync(Buffer.from(serialized));
            const base64 = compressed.toString('base64');
            if (ttlSeconds) {
                await this.client.setex(key, ttlSeconds, base64);
            }
            else {
                await this.client.set(key, base64);
            }
            getLogger().debug({
                key,
                originalSize: serialized.length,
                compressedSize: base64.length,
                ratio: (base64.length / serialized.length).toFixed(2),
            }, 'Stored compressed value');
            return true;
        }
        catch (error) {
            getLogger().warn({ error: String(error), key }, 'Failed to set compressed cache value (non-blocking)');
            return false;
        }
    }
    /**
     * Get a compressed value and decompress
     * Returns null if Redis unavailable or decompression fails
     */
    async getCompressed(key) {
        if (!this.client) {
            return null;
        }
        try {
            const base64 = await this.client.get(key);
            if (!base64)
                return null;
            const compressed = Buffer.from(base64, 'base64');
            const decompressed = await gunzipAsync(compressed);
            const serialized = decompressed.toString('utf8');
            try {
                return JSON.parse(serialized);
            }
            catch {
                return serialized;
            }
        }
        catch (error) {
            getLogger().warn({ error: String(error), key }, 'Failed to get compressed cache value (non-blocking)');
            return null;
        }
    }
    /**
     * Set session data with compression (for large session payloads)
     * Fails silently if Redis unavailable
     */
    async setSessionCompressed(sessionId, data, ttlSeconds) {
        return this.setCompressed(`session:${sessionId}:compressed`, data, ttlSeconds || this.SESSION_TTL);
    }
    /**
     * Get compressed session data
     * Returns null if Redis unavailable
     */
    async getSessionCompressed(sessionId) {
        return this.getCompressed(`session:${sessionId}:compressed`);
    }
    /**
     * Close Redis connection
     */
    async close() {
        if (this.client) {
            await this.client.quit();
            this.client = null;
            this.initialized = false;
            getLogger().info('Redis connection closed');
        }
    }
}
// ============================================================================
// FACTORY (Thread-Safe Singleton)
// ============================================================================
let redisInstance = null;
let redisInstancePromise = null;
/**
 * Get the singleton Redis cache instance (thread-safe)
 * Uses promise-based lazy initialization to prevent race conditions
 * where multiple concurrent calls could create multiple instances.
 */
export function getRedisCache(config) {
    // Fast path: instance already exists
    if (redisInstance) {
        return redisInstance;
    }
    // Slow path: need to create instance
    // Use synchronous assignment to prevent race condition
    if (!redisInstancePromise) {
        // Create instance synchronously - no async operation here
        redisInstance = new RedisCache(config);
    }
    return redisInstance;
}
/**
 * Get Redis cache with async initialization (for cases needing full init)
 * Ensures only one instance is created even under concurrent access.
 */
export async function getRedisCacheAsync(config) {
    // Fast path: already initialized
    if (redisInstance) {
        return redisInstance;
    }
    // Create promise if not exists (atomic check-and-set via closure)
    if (!redisInstancePromise) {
        redisInstancePromise = (async () => {
            const instance = new RedisCache(config);
            await instance.initialize();
            redisInstance = instance;
            return instance;
        })();
    }
    return redisInstancePromise;
}
/**
 * Reset the Redis cache (for testing)
 */
export async function resetRedisCache() {
    // Wait for any pending initialization
    if (redisInstancePromise) {
        try {
            await redisInstancePromise;
        }
        catch {
            // Ignore initialization errors during reset
        }
    }
    if (redisInstance) {
        await redisInstance.close();
        redisInstance = null;
    }
    redisInstancePromise = null;
}
export default RedisCache;
//# sourceMappingURL=redis-cache.js.map