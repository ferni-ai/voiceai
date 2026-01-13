/**
 * Security Events Service
 *
 * Comprehensive security monitoring and audit logging for Ferni AI.
 * Tracks authentication events, suspicious activity, and security anomalies.
 *
 * Philosophy: Security should be invisible but omnipresent.
 * Like a good friend who notices when something's off, but doesn't make a big deal of it.
 *
 * Features:
 * - Failed login tracking with intelligent lockout
 * - Anomaly detection (unusual times, locations, behaviors)
 * - Audit trail for sensitive operations
 * - Privacy-preserving logging (no PII in logs)
 *
 * PERSISTENCE: Uses Redis for rate limiting, Firestore for event audit log.
 *
 * @module SecurityEvents
 */
import { createHmac, randomBytes } from 'crypto';
import admin from 'firebase-admin';
import { getGCPProjectId } from '../config/environment.js';
import { getRedisCache } from '../memory/redis-cache.js';
import { removeUndefined } from '../utils/firestore-utils.js';
import { getLogger } from '../utils/safe-logger.js';
import { registerInterval } from '../utils/interval-manager.js';
const log = getLogger();
// ============================================================================
// CONFIGURATION
// ============================================================================
const DEFAULT_CONFIG = {
    maxFailedAttempts: 5,
    lockoutDurationMs: 15 * 60 * 1000, // 15 minutes
    failureWindowMs: 30 * 60 * 1000, // 30 minute window
    unusualHourStart: 2, // 2 AM
    unusualHourEnd: 5, // 5 AM
};
// ============================================================================
// STORAGE (Redis for rate limiting, Firestore for audit log)
// ============================================================================
// In-memory fallback stores
const failedAttemptsMemory = new Map();
const recentEvents = [];
const MAX_RECENT_EVENTS = 1000;
// Firestore setup
const EVENTS_COLLECTION = 'security_events';
let firestoreInstance = null;
let firestoreInitAttempted = false;
function getFirestore() {
    if (firestoreInstance)
        return firestoreInstance;
    if (firestoreInitAttempted)
        return null;
    firestoreInitAttempted = true;
    try {
        if (admin.apps.length === 0) {
            const projectId = getGCPProjectId();
            if (projectId) {
                admin.initializeApp({ projectId });
            }
            else {
                admin.initializeApp();
            }
        }
        firestoreInstance = admin.firestore();
        log.info('✅ Firestore initialized for security events');
        return firestoreInstance;
    }
    catch (error) {
        log.warn({ error }, 'Firebase not available for security events, using in-memory only');
        return null;
    }
}
// Rate limiting TTLs
const FAILED_ATTEMPTS_TTL = 1800; // 30 minutes
/**
 * Get failed attempts from Redis or memory
 */
async function getFailedAttempts(key) {
    const redis = getRedisCache();
    if (redis) {
        try {
            const data = await redis.get(`security:failed:${key}`);
            if (data)
                return data;
        }
        catch (error) {
            log.warn({ error, key }, 'Redis failed attempts fetch failed, using memory');
        }
    }
    return failedAttemptsMemory.get(key) ?? null;
}
/**
 * Set failed attempts in Redis and memory
 */
async function setFailedAttempts(key, entry) {
    failedAttemptsMemory.set(key, entry);
    const redis = getRedisCache();
    if (redis) {
        try {
            await redis.set(`security:failed:${key}`, entry, FAILED_ATTEMPTS_TTL);
        }
        catch (error) {
            log.warn({ error, key }, 'Redis failed attempts store failed');
        }
    }
}
/**
 * Delete failed attempts from Redis and memory
 */
async function deleteFailedAttempts(key) {
    failedAttemptsMemory.delete(key);
    const redis = getRedisCache();
    if (redis) {
        try {
            await redis.delete(`security:failed:${key}`);
        }
        catch (error) {
            log.warn({ error, key }, 'Redis failed attempts delete failed');
        }
    }
}
/**
 * Save security event to Firestore
 */
async function saveEventToFirestore(event) {
    const db = getFirestore();
    if (!db)
        return;
    try {
        await db
            .collection(EVENTS_COLLECTION)
            .doc(event.id)
            .set(removeUndefined({
            ...event,
            timestamp: event.timestamp,
        }));
    }
    catch (error) {
        log.error({ error, eventId: event.id }, 'Failed to save security event to Firestore');
    }
}
/**
 * Query security events from Firestore
 */
async function queryEventsFromFirestore(filter, limit = 100) {
    const db = getFirestore();
    if (!db)
        return [];
    try {
        let query = db.collection(EVENTS_COLLECTION);
        if (filter.type) {
            query = query.where('type', '==', filter.type);
        }
        if (filter.severity) {
            query = query.where('severity', '==', filter.severity);
        }
        if (filter.actorId) {
            query = query.where('actorId', '==', filter.actorId);
        }
        if (filter.outcome) {
            query = query.where('outcome', '==', filter.outcome);
        }
        const snapshot = await query.orderBy('timestamp', 'desc').limit(limit).get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                ...data,
                timestamp: data.timestamp?.toDate?.() || new Date(data.timestamp),
            };
        });
    }
    catch (error) {
        log.error({ error }, 'Failed to query security events from Firestore');
        return [];
    }
}
// Legacy compatibility wrapper
const failedAttempts = {
    get: (key) => failedAttemptsMemory.get(key),
    set: (key, entry) => {
        void setFailedAttempts(key, entry);
        failedAttemptsMemory.set(key, entry);
    },
    delete: (key) => {
        void deleteFailedAttempts(key);
        failedAttemptsMemory.delete(key);
    },
    has: (key) => failedAttemptsMemory.has(key),
};
// Persistent store reference (set by initialize)
let persistentStore = {
    saveEvent: saveEventToFirestore,
    getEvents: queryEventsFromFirestore,
};
// ============================================================================
// PRIVACY-PRESERVING HELPERS
// ============================================================================
/**
 * Hash sensitive data for logging (one-way, privacy-preserving)
 * SECURITY: In production, LOG_HASH_SECRET MUST be set to prevent predictable hashes
 */
function hashForLogging(value) {
    const secret = process.env.LOG_HASH_SECRET;
    const isDev = process.env.NODE_ENV !== 'production';
    if (!secret) {
        if (!isDev) {
            // In production, log a warning but use a random per-instance salt
            // This prevents predictable hashes while not breaking the system
            log.warn('SECURITY WARNING: LOG_HASH_SECRET not set in production');
        }
        // Use a fallback only in development
        return createHmac('sha256', isDev ? 'dev-only-salt' : randomBytes(32).toString('hex'))
            .update(value)
            .digest('hex')
            .substring(0, 16);
    }
    return createHmac('sha256', secret).update(value).digest('hex').substring(0, 16);
}
/**
 * Generate unique event ID
 */
function generateEventId() {
    return `se_${Date.now()}_${randomBytes(4).toString('hex')}`;
}
/**
 * Determine severity based on event type and context
 */
function determineSeverity(type, outcome, context) {
    // Critical events
    if (type === 'auth_lockout' || type === 'profile_delete') {
        return 'critical';
    }
    // High severity
    if (type === 'suspicious_activity' ||
        type === 'voice_verification_failed' ||
        (type === 'auth_failure' && (context?.consecutiveFailures ?? 0) >= 3)) {
        return 'high';
    }
    // Medium severity
    if (type === 'anomaly_detected' ||
        type === 'rate_limit_exceeded' ||
        type === 'jwt_invalid' ||
        type === 'api_key_invalid') {
        return 'medium';
    }
    // Warnings are medium
    if (outcome === 'warning') {
        return 'medium';
    }
    // Failures are at least low
    if (outcome === 'failure' || outcome === 'blocked') {
        return 'low';
    }
    return 'low';
}
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Record a security event
 */
export async function recordSecurityEvent(params) {
    const event = {
        id: generateEventId(),
        type: params.type,
        severity: determineSeverity(params.type, params.outcome, params.details),
        timestamp: new Date(),
        actorId: params.actorId ? hashForLogging(params.actorId) : undefined,
        actorType: params.actorType || 'unknown',
        targetId: params.targetId ? hashForLogging(params.targetId) : undefined,
        ipHash: params.ip ? hashForLogging(params.ip) : undefined,
        userAgentHash: params.userAgent ? hashForLogging(params.userAgent) : undefined,
        action: params.action,
        outcome: params.outcome,
        details: params.details,
        sessionId: params.sessionId,
        requestId: params.requestId,
    };
    // Store in memory for quick access
    recentEvents.unshift(event);
    if (recentEvents.length > MAX_RECENT_EVENTS) {
        recentEvents.pop();
    }
    // Log based on severity
    const logContext = {
        eventId: event.id,
        type: event.type,
        actorHash: event.actorId,
        outcome: event.outcome,
    };
    switch (event.severity) {
        case 'critical':
            log.error(logContext, `🚨 CRITICAL: ${event.action}`);
            break;
        case 'high':
            log.warn(logContext, `⚠️ HIGH: ${event.action}`);
            break;
        case 'medium':
            log.info(logContext, `📋 ${event.action}`);
            break;
        default:
            log.debug(logContext, `📝 ${event.action}`);
    }
    // Persist if store available
    if (persistentStore) {
        try {
            await persistentStore.saveEvent(event);
        }
        catch (error) {
            log.error({ error }, 'Failed to persist security event');
        }
    }
    return event;
}
/**
 * Track a failed authentication attempt
 * Returns true if account should be locked out
 */
export async function trackFailedAuth(identifier, ip, reason, config = DEFAULT_CONFIG) {
    const key = hashForLogging(identifier);
    const now = Date.now();
    const entry = failedAttempts.get(key) || {
        count: 0,
        firstAttempt: now,
        lastAttempt: now,
    };
    // Check if currently locked out
    if (entry.lockedUntil && entry.lockedUntil > now) {
        await recordSecurityEvent({
            type: 'auth_failure',
            actorId: identifier,
            actorType: 'user',
            ip,
            action: 'Auth attempt during lockout',
            outcome: 'blocked',
            details: { reason, lockedUntil: new Date(entry.lockedUntil) },
        });
        return {
            shouldLock: true,
            attemptsRemaining: 0,
            lockoutUntil: new Date(entry.lockedUntil),
        };
    }
    // Reset window if first attempt was too long ago
    if (now - entry.firstAttempt > config.failureWindowMs) {
        entry.count = 0;
        entry.firstAttempt = now;
    }
    // Increment failure count
    entry.count++;
    entry.lastAttempt = now;
    const attemptsRemaining = Math.max(0, config.maxFailedAttempts - entry.count);
    // Check if we should lock
    if (entry.count >= config.maxFailedAttempts) {
        entry.lockedUntil = now + config.lockoutDurationMs;
        await recordSecurityEvent({
            type: 'auth_lockout',
            actorId: identifier,
            actorType: 'user',
            ip,
            action: `Account locked after ${entry.count} failed attempts`,
            outcome: 'blocked',
            details: {
                failureCount: entry.count,
                lockoutUntil: new Date(entry.lockedUntil),
                reason,
            },
        });
        failedAttempts.set(key, entry);
        return {
            shouldLock: true,
            attemptsRemaining: 0,
            lockoutUntil: new Date(entry.lockedUntil),
        };
    }
    await recordSecurityEvent({
        type: 'auth_failure',
        actorId: identifier,
        actorType: 'user',
        ip,
        action: 'Authentication failed',
        outcome: 'failure',
        details: {
            failureCount: entry.count,
            attemptsRemaining,
            reason,
        },
    });
    failedAttempts.set(key, entry);
    return {
        shouldLock: false,
        attemptsRemaining,
    };
}
/**
 * Clear failed attempts after successful auth
 */
export async function clearFailedAuth(identifier, ip) {
    const key = hashForLogging(identifier);
    const entry = failedAttempts.get(key);
    if (entry && entry.count > 0) {
        // If there were previous failures, log the unlock
        if (entry.lockedUntil) {
            await recordSecurityEvent({
                type: 'auth_unlock',
                actorId: identifier,
                actorType: 'user',
                ip,
                action: 'Account unlocked after successful authentication',
                outcome: 'success',
                details: { previousFailures: entry.count },
            });
        }
    }
    failedAttempts.delete(key);
}
/**
 * Check if an identifier is currently locked out
 */
export function isLockedOut(identifier) {
    const key = hashForLogging(identifier);
    const entry = failedAttempts.get(key);
    if (!entry || !entry.lockedUntil) {
        return { locked: false };
    }
    const now = Date.now();
    if (entry.lockedUntil > now) {
        return {
            locked: true,
            remainingMs: entry.lockedUntil - now,
            lockoutUntil: new Date(entry.lockedUntil),
        };
    }
    return { locked: false };
}
/**
 * Detect anomalies in authentication behavior
 */
export async function detectAnomalies(params) {
    const reasons = [];
    const hour = params.hour ?? new Date().getHours();
    // Check for unusual hour access
    if (hour >= DEFAULT_CONFIG.unusualHourStart && hour < DEFAULT_CONFIG.unusualHourEnd) {
        reasons.push(`Unusual access hour (${hour}:00)`);
    }
    // Check for rapid requests from same user (potential automation)
    const recentFromUser = recentEvents.filter((e) => e.actorId === hashForLogging(params.userId) && Date.now() - e.timestamp.getTime() < 60000);
    if (recentFromUser.length > 20) {
        reasons.push(`High request frequency (${recentFromUser.length} in last minute)`);
    }
    // Check for multiple failed auths from same IP
    const recentFailures = recentEvents.filter((e) => e.type === 'auth_failure' &&
        params.ip &&
        e.ipHash === hashForLogging(params.ip) &&
        Date.now() - e.timestamp.getTime() < 300000 // 5 minutes
    );
    if (recentFailures.length >= 3) {
        reasons.push(`Multiple auth failures from IP (${recentFailures.length} in 5 min)`);
    }
    if (reasons.length > 0) {
        await recordSecurityEvent({
            type: 'anomaly_detected',
            actorId: params.userId,
            actorType: 'user',
            ip: params.ip,
            userAgent: params.userAgent,
            action: `Anomaly detected: ${reasons.join(', ')}`,
            outcome: 'warning',
            details: { reasons, action: params.action },
        });
    }
    return {
        isAnomalous: reasons.length > 0,
        reasons,
    };
}
/**
 * Record successful authentication
 */
export async function recordSuccessfulAuth(params) {
    await clearFailedAuth(params.userId, params.ip);
    await recordSecurityEvent({
        type: 'auth_success',
        actorId: params.userId,
        actorType: 'user',
        ip: params.ip,
        userAgent: params.userAgent,
        sessionId: params.sessionId,
        action: `Authentication successful via ${params.method}`,
        outcome: 'success',
        details: { method: params.method },
    });
    // Check for anomalies even on success
    await detectAnomalies({
        userId: params.userId,
        ip: params.ip,
        userAgent: params.userAgent,
        action: 'authentication',
    });
}
/**
 * Record sensitive data access
 */
export async function recordDataAccess(params) {
    const isSelfAccess = params.userId === params.targetUserId;
    await recordSecurityEvent({
        type: params.action === 'read'
            ? 'profile_access'
            : params.action === 'delete'
                ? 'profile_delete'
                : params.action === 'export'
                    ? 'data_export'
                    : 'profile_update',
        actorId: params.userId,
        actorType: 'user',
        targetId: params.targetUserId,
        ip: params.ip,
        sessionId: params.sessionId,
        action: `${params.action} ${params.dataType}${isSelfAccess ? ' (self)' : ' (other)'}`,
        outcome: 'success',
        details: {
            dataType: params.dataType,
            isSelfAccess,
        },
    });
}
/**
 * Record voice-related security events
 */
export async function recordVoiceEvent(params) {
    const eventType = params.type === 'enrolled'
        ? 'voice_enrolled'
        : params.type === 'mismatch'
            ? 'voice_mismatch'
            : params.type === 'failed'
                ? 'voice_verification_failed'
                : 'auth_success';
    const outcome = params.type === 'enrolled' || params.type === 'verified'
        ? 'success'
        : params.type === 'mismatch'
            ? 'warning'
            : 'failure';
    await recordSecurityEvent({
        type: eventType,
        actorId: params.userId,
        actorType: 'user',
        ip: params.ip,
        sessionId: params.sessionId,
        action: `Voice ${params.type}`,
        outcome,
        details: {
            confidence: params.confidence,
        },
    });
}
// ============================================================================
// ANALYTICS & REPORTING
// ============================================================================
/**
 * Get security metrics for monitoring
 */
export function getSecurityMetrics() {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const eventsByType = {};
    const eventsBySeverity = {};
    let last24hFailures = 0;
    for (const event of recentEvents) {
        eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
        eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
        if (event.type === 'auth_failure' && event.timestamp.getTime() > oneDayAgo) {
            last24hFailures++;
        }
    }
    // Count active lockouts
    let activeLockedAccounts = 0;
    for (const [, entry] of failedAttemptsMemory) {
        if (entry.lockedUntil && entry.lockedUntil > now) {
            activeLockedAccounts++;
        }
    }
    return {
        recentEventsCount: recentEvents.length,
        activeLockedAccounts,
        eventsByType,
        eventsBySeverity,
        last24hFailures,
    };
}
/**
 * Get recent events for dashboard/debugging
 */
export function getRecentEvents(filter) {
    let filtered = [...recentEvents];
    if (filter?.type) {
        filtered = filtered.filter((e) => e.type === filter.type);
    }
    if (filter?.severity) {
        filtered = filtered.filter((e) => e.severity === filter.severity);
    }
    if (filter?.actorId) {
        const hashedActor = hashForLogging(filter.actorId);
        filtered = filtered.filter((e) => e.actorId === hashedActor);
    }
    return filtered.slice(0, filter?.limit || 100);
}
/**
 * Record an agent-initiated graceful exit event.
 *
 * This tracks when agents choose to end conversations due to
 * discomfort, boundary violations, or safety concerns.
 * Used for:
 * - Pattern detection (same user triggering multiple exits)
 * - Safety monitoring
 * - Quality improvement
 */
export async function recordAgentGracefulExit(params) {
    const { userId, sessionId, personaId, reason, briefNote } = params;
    // Determine severity based on reason
    const severityMap = {
        harassment: 'high',
        safety_concern: 'high',
        inappropriate_content: 'medium',
        boundary_crossed: 'medium',
        uncomfortable: 'low',
        unproductive: 'low',
    };
    return recordSecurityEvent({
        type: 'agent_graceful_exit',
        actorId: userId,
        actorType: 'user',
        action: `Agent initiated graceful exit: ${reason}`,
        outcome: 'warning',
        details: {
            reason,
            personaId,
            briefNote: briefNote ? '[redacted]' : undefined, // Don't log actual note
            timestamp: new Date().toISOString(),
        },
        sessionId,
    });
}
// ============================================================================
// INITIALIZATION & CLEANUP
// ============================================================================
/**
 * Initialize security events with persistent store
 */
export function initializeSecurityEvents(store) {
    if (store) {
        persistentStore = store;
        log.info('Security events initialized with persistent store');
    }
    else {
        log.warn('Security events running with in-memory store only');
    }
}
/**
 * Cleanup old entries (call periodically)
 */
export function cleanupSecurityData() {
    const now = Date.now();
    // Cleanup expired lockouts
    for (const [key, entry] of failedAttemptsMemory) {
        if (entry.lockedUntil && entry.lockedUntil < now - DEFAULT_CONFIG.lockoutDurationMs) {
            void deleteFailedAttempts(key);
        }
    }
    // Trim in-memory events to max
    while (recentEvents.length > MAX_RECENT_EVENTS) {
        recentEvents.pop();
    }
}
// Periodic cleanup (every 5 minutes, managed by IntervalManager)
registerInterval('security-events-cleanup', cleanupSecurityData, 5 * 60 * 1000);
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    recordSecurityEvent,
    recordAgentGracefulExit,
    trackFailedAuth,
    clearFailedAuth,
    isLockedOut,
    detectAnomalies,
    recordSuccessfulAuth,
    recordDataAccess,
    recordVoiceEvent,
    getSecurityMetrics,
    getRecentEvents,
    initializeSecurityEvents,
    cleanupSecurityData,
};
//# sourceMappingURL=security-events.js.map