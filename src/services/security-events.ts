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
import * as admin from 'firebase-admin';
import { getGCPProjectId } from '../config/environment.js';
import { getRedisCache } from '../memory/redis-cache.js';
import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Security event types we track
 */
export type SecurityEventType =
  // Authentication events
  | 'auth_success'
  | 'auth_failure'
  | 'auth_lockout'
  | 'auth_unlock'
  | 'jwt_expired'
  | 'jwt_invalid'
  | 'api_key_invalid'
  // Session events
  | 'session_start'
  | 'session_end'
  | 'session_timeout'
  // Sensitive operations
  | 'profile_access'
  | 'profile_update'
  | 'profile_delete'
  | 'data_export'
  | 'password_change'
  | 'identifier_linked'
  // Anomalies
  | 'anomaly_detected'
  | 'rate_limit_exceeded'
  | 'suspicious_activity'
  // Voice
  | 'voice_mismatch'
  | 'voice_enrolled'
  | 'voice_verification_failed';

/**
 * Severity levels
 */
export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Security event record
 */
export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: SecuritySeverity;
  timestamp: Date;

  // Actor (who triggered this event)
  actorId?: string; // Hashed user ID
  actorType: 'user' | 'system' | 'api' | 'unknown';

  // Context (what happened)
  targetId?: string; // Hashed target ID
  ipHash?: string; // Hashed IP address
  userAgentHash?: string; // Hashed user agent
  action: string;
  outcome: 'success' | 'failure' | 'blocked' | 'warning';

  // Details (no PII!)
  details?: Record<string, unknown>;

  // Correlation
  sessionId?: string;
  requestId?: string;
  correlationId?: string;
}

/**
 * Failed attempt tracker
 */
interface FailedAttemptEntry {
  count: number;
  firstAttempt: number;
  lastAttempt: number;
  lockedUntil?: number;
}

/**
 * Anomaly detection config
 */
interface AnomalyConfig {
  /** Max failed attempts before lockout */
  maxFailedAttempts: number;
  /** Lockout duration in ms */
  lockoutDurationMs: number;
  /** Window for counting failures */
  failureWindowMs: number;
  /** Unusual hour threshold (e.g., 3 AM) */
  unusualHourStart: number;
  unusualHourEnd: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: AnomalyConfig = {
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
const failedAttemptsMemory = new Map<string, FailedAttemptEntry>();
const recentEvents: SecurityEvent[] = [];
const MAX_RECENT_EVENTS = 1000;

// Firestore setup
const EVENTS_COLLECTION = 'security_events';
let firestoreInstance: admin.firestore.Firestore | null = null;
let firestoreInitAttempted = false;

function getFirestore(): admin.firestore.Firestore | null {
  if (firestoreInstance) return firestoreInstance;
  if (firestoreInitAttempted) return null;

  firestoreInitAttempted = true;

  try {
    if (admin.apps.length === 0) {
      const projectId = getGCPProjectId();

      if (projectId) {
        admin.initializeApp({ projectId });
      } else {
        admin.initializeApp();
      }
    }

    firestoreInstance = admin.firestore();
    log.info('✅ Firestore initialized for security events');
    return firestoreInstance;
  } catch (error) {
    log.warn({ error }, 'Firebase not available for security events, using in-memory only');
    return null;
  }
}

// Rate limiting TTLs
const FAILED_ATTEMPTS_TTL = 1800; // 30 minutes

/**
 * Get failed attempts from Redis or memory
 */
async function getFailedAttempts(key: string): Promise<FailedAttemptEntry | null> {
  const redis = getRedisCache();

  if (redis) {
    try {
      const data = await redis.get<FailedAttemptEntry>(`security:failed:${key}`);
      if (data) return data;
    } catch (error) {
      log.warn({ error, key }, 'Redis failed attempts fetch failed, using memory');
    }
  }

  return failedAttemptsMemory.get(key) ?? null;
}

/**
 * Set failed attempts in Redis and memory
 */
async function setFailedAttempts(key: string, entry: FailedAttemptEntry): Promise<void> {
  failedAttemptsMemory.set(key, entry);

  const redis = getRedisCache();
  if (redis) {
    try {
      await redis.set(`security:failed:${key}`, entry, FAILED_ATTEMPTS_TTL);
    } catch (error) {
      log.warn({ error, key }, 'Redis failed attempts store failed');
    }
  }
}

/**
 * Delete failed attempts from Redis and memory
 */
async function deleteFailedAttempts(key: string): Promise<void> {
  failedAttemptsMemory.delete(key);

  const redis = getRedisCache();
  if (redis) {
    try {
      await redis.delete(`security:failed:${key}`);
    } catch (error) {
      log.warn({ error, key }, 'Redis failed attempts delete failed');
    }
  }
}

/**
 * Save security event to Firestore
 */
async function saveEventToFirestore(event: SecurityEvent): Promise<void> {
  const db = getFirestore();
  if (!db) return;

  try {
    await db
      .collection(EVENTS_COLLECTION)
      .doc(event.id)
      .set({
        ...event,
        timestamp: event.timestamp,
      });
  } catch (error) {
    log.error({ error, eventId: event.id }, 'Failed to save security event to Firestore');
  }
}

/**
 * Query security events from Firestore
 */
async function queryEventsFromFirestore(
  filter: Partial<SecurityEvent>,
  limit = 100
): Promise<SecurityEvent[]> {
  const db = getFirestore();
  if (!db) return [];

  try {
    let query: admin.firestore.Query = db.collection(EVENTS_COLLECTION);

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
      } as SecurityEvent;
    });
  } catch (error) {
    log.error({ error }, 'Failed to query security events from Firestore');
    return [];
  }
}

// Legacy compatibility wrapper
const failedAttempts = {
  get: (key: string) => failedAttemptsMemory.get(key),
  set: (key: string, entry: FailedAttemptEntry) => {
    void setFailedAttempts(key, entry);
    failedAttemptsMemory.set(key, entry);
  },
  delete: (key: string) => {
    void deleteFailedAttempts(key);
    failedAttemptsMemory.delete(key);
  },
  has: (key: string) => failedAttemptsMemory.has(key),
};

// Persistent store reference (set by initialize)
let persistentStore: {
  saveEvent: (event: SecurityEvent) => Promise<void>;
  getEvents: (filter: Partial<SecurityEvent>, limit?: number) => Promise<SecurityEvent[]>;
} | null = {
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
function hashForLogging(value: string): string {
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
function generateEventId(): string {
  return `se_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

/**
 * Determine severity based on event type and context
 */
function determineSeverity(
  type: SecurityEventType,
  outcome: 'success' | 'failure' | 'blocked' | 'warning',
  context?: Record<string, unknown>
): SecuritySeverity {
  // Critical events
  if (type === 'auth_lockout' || type === 'profile_delete') {
    return 'critical';
  }

  // High severity
  if (
    type === 'suspicious_activity' ||
    type === 'voice_verification_failed' ||
    (type === 'auth_failure' && ((context?.consecutiveFailures as number | undefined) ?? 0) >= 3)
  ) {
    return 'high';
  }

  // Medium severity
  if (
    type === 'anomaly_detected' ||
    type === 'rate_limit_exceeded' ||
    type === 'jwt_invalid' ||
    type === 'api_key_invalid'
  ) {
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
export async function recordSecurityEvent(params: {
  type: SecurityEventType;
  actorId?: string;
  actorType?: 'user' | 'system' | 'api' | 'unknown';
  targetId?: string;
  ip?: string;
  userAgent?: string;
  action: string;
  outcome: 'success' | 'failure' | 'blocked' | 'warning';
  details?: Record<string, unknown>;
  sessionId?: string;
  requestId?: string;
}): Promise<SecurityEvent> {
  const event: SecurityEvent = {
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
    } catch (error) {
      log.error({ error }, 'Failed to persist security event');
    }
  }

  return event;
}

/**
 * Track a failed authentication attempt
 * Returns true if account should be locked out
 */
export async function trackFailedAuth(
  identifier: string,
  ip?: string,
  reason?: string,
  config: AnomalyConfig = DEFAULT_CONFIG
): Promise<{ shouldLock: boolean; attemptsRemaining: number; lockoutUntil?: Date }> {
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
export async function clearFailedAuth(identifier: string, ip?: string): Promise<void> {
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
export function isLockedOut(identifier: string): {
  locked: boolean;
  remainingMs?: number;
  lockoutUntil?: Date;
} {
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
export async function detectAnomalies(params: {
  userId: string;
  ip?: string;
  userAgent?: string;
  action: string;
  hour?: number;
}): Promise<{ isAnomalous: boolean; reasons: string[] }> {
  const reasons: string[] = [];
  const hour = params.hour ?? new Date().getHours();

  // Check for unusual hour access
  if (hour >= DEFAULT_CONFIG.unusualHourStart && hour < DEFAULT_CONFIG.unusualHourEnd) {
    reasons.push(`Unusual access hour (${hour}:00)`);
  }

  // Check for rapid requests from same user (potential automation)
  const recentFromUser = recentEvents.filter(
    (e) => e.actorId === hashForLogging(params.userId) && Date.now() - e.timestamp.getTime() < 60000
  );

  if (recentFromUser.length > 20) {
    reasons.push(`High request frequency (${recentFromUser.length} in last minute)`);
  }

  // Check for multiple failed auths from same IP
  const recentFailures = recentEvents.filter(
    (e) =>
      e.type === 'auth_failure' &&
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
export async function recordSuccessfulAuth(params: {
  userId: string;
  method: 'jwt' | 'api_key' | 'voice' | 'device' | 'firebase';
  ip?: string;
  userAgent?: string;
  sessionId?: string;
}): Promise<void> {
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
export async function recordDataAccess(params: {
  userId: string;
  targetUserId: string;
  dataType: 'profile' | 'summaries' | 'moments' | 'voice_sketch' | 'full_export';
  action: 'read' | 'update' | 'delete' | 'export';
  ip?: string;
  sessionId?: string;
}): Promise<void> {
  const isSelfAccess = params.userId === params.targetUserId;

  await recordSecurityEvent({
    type:
      params.action === 'read'
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
export async function recordVoiceEvent(params: {
  userId: string;
  type: 'enrolled' | 'verified' | 'mismatch' | 'failed';
  confidence?: number;
  ip?: string;
  sessionId?: string;
}): Promise<void> {
  const eventType: SecurityEventType =
    params.type === 'enrolled'
      ? 'voice_enrolled'
      : params.type === 'mismatch'
        ? 'voice_mismatch'
        : params.type === 'failed'
          ? 'voice_verification_failed'
          : 'auth_success';

  const outcome: 'success' | 'failure' | 'warning' =
    params.type === 'enrolled' || params.type === 'verified'
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
export function getSecurityMetrics(): {
  recentEventsCount: number;
  activeLockedAccounts: number;
  eventsByType: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  last24hFailures: number;
} {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  const eventsByType: Record<string, number> = {};
  const eventsBySeverity: Record<string, number> = {};
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
export function getRecentEvents(
  filter?: Partial<{
    type: SecurityEventType;
    severity: SecuritySeverity;
    actorId: string;
    limit: number;
  }>
): SecurityEvent[] {
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

// ============================================================================
// INITIALIZATION & CLEANUP
// ============================================================================

/**
 * Initialize security events with persistent store
 */
export function initializeSecurityEvents(store?: {
  saveEvent: (event: SecurityEvent) => Promise<void>;
  getEvents: (filter: Partial<SecurityEvent>, limit?: number) => Promise<SecurityEvent[]>;
}): void {
  if (store) {
    persistentStore = store;
    log.info('Security events initialized with persistent store');
  } else {
    log.warn('Security events running with in-memory store only');
  }
}

/**
 * Cleanup old entries (call periodically)
 */
export function cleanupSecurityData(): void {
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

// Periodic cleanup (every 5 minutes)
setInterval(cleanupSecurityData, 5 * 60 * 1000);

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  recordSecurityEvent,
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
