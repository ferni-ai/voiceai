/**
 * Session Data Manager
 *
 * Unified lifecycle management for all session-scoped user data caches.
 * Ensures Node stays stateless by:
 * 1. Tracking all services that cache user data
 * 2. Cleaning up on session disconnect
 * 3. TTL-based auto-eviction as safety net
 * 4. Memory monitoring and alerts
 *
 * Philosophy: "Node should be stateless - user data belongs in the database"
 *
 * @module SessionDataManager
 */
import * as v8 from 'v8';
import { createLogger } from '../utils/safe-logger.js';
import { registerInterval, clearNamedInterval, hasInterval } from '../utils/interval-manager.js';
const log = createLogger({ module: 'SessionDataManager' });
// ============================================================================
// DEFAULT CONFIG
// ============================================================================
const DEFAULT_CONFIG = {
    maxSessionAge: 4 * 60 * 60 * 1000, // 4 hours
    evictionCheckInterval: 5 * 60 * 1000, // 5 minutes
    memoryThresholdMB: 512,
    verbose: false,
};
// ============================================================================
// SESSION DATA MANAGER
// ============================================================================
const EVICTION_INTERVAL = 'session-data-manager-eviction';
const MEMORY_CHECK_INTERVAL = 'session-data-manager-memory';
class SessionDataManagerImpl {
    services = new Map();
    sessions = new Map();
    config;
    isShuttingDown = false;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    // ==========================================================================
    // SERVICE REGISTRATION
    // ==========================================================================
    /**
     * Register a service that caches user data.
     * All registered services will be cleaned up on session end.
     */
    registerService(service) {
        if (this.services.has(service.name)) {
            log.warn({ service: service.name }, 'Service already registered, replacing');
        }
        this.services.set(service.name, service);
        log.info({ service: service.name, totalServices: this.services.size }, '📦 Service registered');
    }
    /**
     * Unregister a service (for testing or dynamic unloading)
     */
    unregisterService(name) {
        this.services.delete(name);
    }
    // ==========================================================================
    // SESSION LIFECYCLE
    // ==========================================================================
    /**
     * Mark that a session has started for a user.
     * Call this when a voice session connects.
     */
    sessionStarted(userId) {
        const existing = this.sessions.get(userId);
        if (existing) {
            // Session already exists, just update activity
            existing.lastActivity = Date.now();
            return;
        }
        this.sessions.set(userId, {
            userId,
            startedAt: Date.now(),
            lastActivity: Date.now(),
            services: new Set(),
        });
        if (this.config.verbose) {
            log.debug({ userId, activeSessions: this.sessions.size }, 'Session started');
        }
    }
    /**
     * Mark that a service has cached data for a user.
     * This helps track which services need cleanup.
     */
    markServiceActive(userId, serviceName) {
        const session = this.sessions.get(userId);
        if (session) {
            session.services.add(serviceName);
            session.lastActivity = Date.now();
        }
    }
    /**
     * Clean up ALL cached data for a user.
     * Call this when a voice session disconnects.
     */
    async sessionEnded(userId) {
        const results = { cleaned: [], errors: [] };
        if (this.isShuttingDown) {
            log.debug({ userId }, 'Skipping cleanup during shutdown');
            return results;
        }
        const session = this.sessions.get(userId);
        const startTime = Date.now();
        // Clean up all registered services
        for (const [name, service] of this.services) {
            try {
                await service.clearUserData(userId);
                results.cleaned.push(name);
            }
            catch (error) {
                results.errors.push(name);
                log.warn({ service: name, userId, error: String(error) }, 'Service cleanup failed');
            }
        }
        // Remove session tracking
        this.sessions.delete(userId);
        const duration = Date.now() - startTime;
        log.info({
            userId,
            cleaned: results.cleaned.length,
            errors: results.errors.length,
            duration,
            remainingSessions: this.sessions.size,
        }, '🧹 Session data cleaned');
        return results;
    }
    /**
     * Update last activity time for a user.
     * Call this periodically during active sessions to prevent premature eviction.
     */
    touchSession(userId) {
        const session = this.sessions.get(userId);
        if (session) {
            session.lastActivity = Date.now();
        }
    }
    // ==========================================================================
    // AUTO-EVICTION (Safety Net)
    // ==========================================================================
    /**
     * Start the automatic eviction timer.
     * This is a safety net for sessions that disconnect without proper cleanup.
     */
    startAutoEviction() {
        if (hasInterval(EVICTION_INTERVAL)) {
            return; // Already running
        }
        registerInterval(EVICTION_INTERVAL, () => {
            void this.evictStaleSessions();
        }, this.config.evictionCheckInterval);
        log.info({ intervalMs: this.config.evictionCheckInterval, maxAgeMs: this.config.maxSessionAge }, '⏰ Auto-eviction started');
    }
    /**
     * Stop auto-eviction (for shutdown)
     */
    stopAutoEviction() {
        clearNamedInterval(EVICTION_INTERVAL);
    }
    /**
     * Evict sessions that have been inactive too long.
     */
    async evictStaleSessions() {
        const now = Date.now();
        const staleUserIds = [];
        for (const [userId, session] of this.sessions) {
            const age = now - session.lastActivity;
            if (age > this.config.maxSessionAge) {
                staleUserIds.push(userId);
            }
        }
        if (staleUserIds.length === 0) {
            return 0;
        }
        log.info({ count: staleUserIds.length, maxAgeHours: this.config.maxSessionAge / (60 * 60 * 1000) }, '🗑️ Evicting stale sessions');
        for (const userId of staleUserIds) {
            await this.sessionEnded(userId);
        }
        return staleUserIds.length;
    }
    // ==========================================================================
    // MEMORY MONITORING
    // ==========================================================================
    /**
     * Check memory usage and trigger tiered cleanup if needed.
     * Uses aggressive multi-level cleanup strategy:
     * - Level 1 (70%): Light cleanup - evict oldest 10% of sessions
     * - Level 2 (80%): Medium cleanup - evict oldest 25% + force GC
     * - Level 3 (90%): Aggressive cleanup - evict 50% + clear all service caches + force GC
     * - Level 4 (95%): Emergency cleanup - clear ALL caches
     */
    async checkMemoryPressure() {
        const memUsage = process.memoryUsage();
        const heapStats = v8.getHeapStatistics();
        const heapUsedMB = memUsage.heapUsed / (1024 * 1024);
        // Use heap_size_limit (actual max) instead of heapTotal (current allocation)
        const heapMaxMB = heapStats.heap_size_limit / (1024 * 1024);
        const percentUsed = (heapUsedMB / heapMaxMB) * 100;
        // Determine cleanup level based on heap percentage
        let level = 0;
        if (percentUsed >= 95) {
            level = 4;
        }
        else if (percentUsed >= 90) {
            level = 3;
        }
        else if (percentUsed >= 80) {
            level = 2;
        }
        else if (percentUsed >= 70) {
            level = 1;
        }
        if (level === 0) {
            return { triggered: false, level: 0, evicted: 0 };
        }
        const startHeap = memUsage.heapUsed;
        log.warn({
            level,
            heapUsedMB: Math.round(heapUsedMB),
            heapMaxMB: Math.round(heapMaxMB),
            percentUsed: Math.round(percentUsed),
            sessions: this.sessions.size,
        }, `⚠️ Memory pressure level ${level} - triggering cleanup`);
        // Sort sessions by last activity (oldest first)
        const sessions = Array.from(this.sessions.entries()).sort((a, b) => a[1].lastActivity - b[1].lastActivity);
        let evicted = 0;
        const evictionRates = { 1: 0.1, 2: 0.25, 3: 0.5, 4: 1.0 };
        const toEvict = Math.ceil(sessions.length * evictionRates[level]);
        // Evict sessions
        for (let i = 0; i < toEvict && i < sessions.length; i++) {
            await this.sessionEnded(sessions[i][0]);
            evicted++;
        }
        // Level 2+: Clear service caches aggressively
        if (level >= 2) {
            for (const [name, service] of this.services) {
                try {
                    await service.clearAllData();
                    log.debug({ service: name }, 'Cleared service cache (memory pressure)');
                }
                catch (err) {
                    log.warn({ service: name, error: String(err) }, 'Failed to clear service cache');
                }
            }
        }
        // Level 2+: Force garbage collection if available
        if (level >= 2 && global.gc) {
            global.gc();
            log.debug('Forced garbage collection');
        }
        // Level 4: Emergency - clear everything
        if (level === 4) {
            for (const [name, service] of this.services) {
                try {
                    await service.clearAllData();
                    log.warn({ service: name }, '⚠️ Emergency cleanup - cleared service cache');
                }
                catch (err) {
                    log.error({ service: name, error: String(err) }, 'Failed to clear service in emergency');
                }
            }
            this.sessions.clear();
            log.warn('⚠️ Emergency cleanup - cleared ALL caches');
        }
        const endHeap = process.memoryUsage().heapUsed;
        const freedMB = (startHeap - endHeap) / (1024 * 1024);
        log.info({
            level,
            evicted,
            freedMB: Math.round(freedMB * 100) / 100,
            heapAfterMB: Math.round((endHeap / (1024 * 1024)) * 100) / 100,
        }, `✅ Memory cleanup level ${level} complete`);
        return { triggered: true, level, evicted, freedMB: Math.max(0, freedMB) };
    }
    /**
     * Start periodic memory pressure monitoring.
     * Checks more frequently than session eviction.
     */
    startMemoryMonitoring(intervalMs = 30000) {
        if (hasInterval(MEMORY_CHECK_INTERVAL)) {
            return;
        }
        registerInterval(MEMORY_CHECK_INTERVAL, () => {
            void this.checkMemoryPressure();
        }, intervalMs);
        log.info({ intervalMs }, '🧠 Memory pressure monitoring started');
    }
    stopMemoryMonitoring() {
        clearNamedInterval(MEMORY_CHECK_INTERVAL);
    }
    /**
     * Get comprehensive statistics about all caches.
     */
    getStats() {
        const memUsage = process.memoryUsage();
        const serviceStats = {};
        for (const [name, service] of this.services) {
            try {
                const stats = service.getStats();
                serviceStats[name] = stats;
            }
            catch {
                serviceStats[name] = { users: -1, entries: -1 };
            }
        }
        let oldestSessionAge = null;
        const now = Date.now();
        for (const session of this.sessions.values()) {
            const age = now - session.startedAt;
            if (oldestSessionAge === null || age > oldestSessionAge) {
                oldestSessionAge = age;
            }
        }
        const heapStats = v8.getHeapStatistics();
        const heapUsedMB = memUsage.heapUsed / (1024 * 1024);
        const heapMaxMB = heapStats.heap_size_limit / (1024 * 1024);
        return {
            activeSessions: this.sessions.size,
            services: serviceStats,
            memory: {
                heapUsedMB: Math.round(heapUsedMB),
                heapMaxMB: Math.round(heapMaxMB),
                percentUsed: Math.round((heapUsedMB / heapMaxMB) * 100),
                rss: Math.round(memUsage.rss / (1024 * 1024)),
            },
            oldestSessionAge,
        };
    }
    // ==========================================================================
    // SHUTDOWN
    // ==========================================================================
    /**
     * Graceful shutdown - flush and clear all caches.
     */
    async shutdown() {
        this.isShuttingDown = true;
        this.stopAutoEviction();
        this.stopMemoryMonitoring();
        log.info({ sessions: this.sessions.size, services: this.services.size }, '🛑 SessionDataManager shutting down');
        // Clear all services
        for (const [name, service] of this.services) {
            try {
                await service.clearAllData();
                log.debug({ service: name }, 'Service cleared');
            }
            catch (error) {
                log.warn({ service: name, error: String(error) }, 'Service shutdown failed');
            }
        }
        this.sessions.clear();
        this.services.clear();
        log.info('SessionDataManager shutdown complete');
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let instance = null;
/**
 * Get the singleton SessionDataManager instance.
 */
export function getSessionDataManager() {
    if (!instance) {
        instance = new SessionDataManagerImpl();
    }
    return instance;
}
/**
 * Initialize the SessionDataManager with config and start auto-eviction.
 */
export function initializeSessionDataManager(config) {
    if (instance) {
        log.warn('SessionDataManager already initialized');
        return instance;
    }
    instance = new SessionDataManagerImpl(config);
    instance.startAutoEviction();
    instance.startMemoryMonitoring(); // Monitor memory pressure every 30 seconds
    log.info('SessionDataManager initialized with memory monitoring');
    return instance;
}
/**
 * Shutdown the SessionDataManager.
 */
export async function shutdownSessionDataManager() {
    if (instance) {
        await instance.shutdown();
        instance = null;
    }
}
// ============================================================================
// HELPER: Create a session-aware cache wrapper
// ============================================================================
/**
 * Creates a Map-like cache that automatically registers with SessionDataManager.
 * Use this as a drop-in replacement for module-level Maps that store user data.
 */
export function createSessionCache(serviceName, options) {
    const cache = new Map();
    const getUserId = options?.getUserIdFromKey ?? ((key) => key);
    // Register with SessionDataManager
    const service = {
        name: serviceName,
        clearUserData(userId) {
            const keysToDelete = [];
            for (const key of cache.keys()) {
                if (getUserId(key) === userId) {
                    keysToDelete.push(key);
                }
            }
            for (const key of keysToDelete) {
                cache.delete(key);
            }
            options?.onClear?.(userId);
        },
        clearAllData() {
            cache.clear();
        },
        getStats() {
            const users = new Set();
            for (const key of cache.keys()) {
                users.add(getUserId(key));
            }
            return { users: users.size, entries: cache.size };
        },
    };
    getSessionDataManager().registerService(service);
    // Return Map-like interface
    return {
        get: (key) => cache.get(key),
        set: (key, value) => {
            const userId = getUserId(key);
            getSessionDataManager().markServiceActive(userId, serviceName);
            cache.set(key, value);
        },
        delete: (key) => cache.delete(key),
        has: (key) => cache.has(key),
        clear: () => cache.clear(),
        get size() {
            return cache.size;
        },
        entries: () => cache.entries(),
        values: () => cache.values(),
        keys: () => cache.keys(),
    };
}
export default {
    getSessionDataManager,
    initializeSessionDataManager,
    shutdownSessionDataManager,
    createSessionCache,
};
//# sourceMappingURL=session-data-manager.js.map