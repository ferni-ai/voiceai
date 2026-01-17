/**
 * Voice Authentication Audit Logging
 *
 * Tracks all voice authentication events for security monitoring.
 * Enables detection of suspicious patterns and compliance reporting.
 *
 * LOGGED EVENTS:
 * - Enrollment attempts (start, sample, complete, fail)
 * - Verification attempts (success, fail)
 * - Identification attempts
 * - Profile management (delete, export)
 * - Security events (liveness fail, spoof detect)
 *
 * @module VoiceAuditLog
 */

import pino from 'pino';
import admin from 'firebase-admin';
import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';

const log = pino({ name: 'voice-audit' });

// ============================================================================
// TYPES
// ============================================================================

export type VoiceAuthAction =
  | 'enroll_start'
  | 'enroll_sample'
  | 'enroll_complete'
  | 'enroll_fail'
  | 'verify_success'
  | 'verify_fail'
  | 'identify_success'
  | 'identify_fail'
  | 'profile_delete'
  | 'profile_export'
  | 'liveness_fail'
  | 'spoof_detected'
  | 'continuous_auth_fail'
  | 'speaker_change';

export interface VoiceAuthAuditEntry {
  // Core fields
  id?: string;
  timestamp: Date;
  action: VoiceAuthAction;
  userId: string;

  // Result
  success: boolean;
  confidence?: number;

  // Context
  deviceInfo: {
    userAgent?: string;
    platform?: string;
    deviceId?: string;
  };

  // Request metadata
  requestId?: string;
  sessionId?: string;
  ipAddress?: string;

  // Security flags
  anomalies?: string[];
  riskScore?: number;

  // Additional details
  details?: Record<string, unknown>;
}

export interface AuditQueryOptions {
  userId?: string;
  action?: VoiceAuthAction | VoiceAuthAction[];
  startDate?: Date;
  endDate?: Date;
  success?: boolean;
  limit?: number;
  includeAnomolies?: boolean;
}

export interface AuditStats {
  totalEvents: number;
  successRate: number;
  failedAttempts: number;
  uniqueUsers: number;
  anomalyCount: number;
  topActions: Array<{ action: VoiceAuthAction; count: number }>;
  recentActivity: VoiceAuthAuditEntry[];
}

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

const COLLECTION_NAME = 'voice_auth_audit';
const RETENTION_DAYS = 90; // Keep audit logs for 90 days
const FIRESTORE_BATCH_LIMIT = 500; // Firestore batch write limit

let firestoreInstance: admin.firestore.Firestore | null = null;
let initAttempted = false;

function getFirestore(): admin.firestore.Firestore | null {
  if (firestoreInstance) return firestoreInstance;
  if (initAttempted) return null;

  initAttempted = true;

  try {
    if (admin.apps.length === 0) {
      const projectId =
        process.env.GCP_PROJECT_ID ||
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT;

      if (projectId) {
        admin.initializeApp({ projectId });
      } else {
        admin.initializeApp();
      }
    }

    firestoreInstance = admin.firestore();
    return firestoreInstance;
  } catch (error) {
    log.warn({ error }, 'Firebase not available for audit logging');
    return null;
  }
}

// In-memory fallback for development
const inMemoryAuditLog: VoiceAuthAuditEntry[] = [];
const MAX_IN_MEMORY_ENTRIES = 1000;

// ============================================================================
// LOGGING FUNCTIONS
// ============================================================================

/**
 * Log a voice authentication event.
 */
export async function logVoiceAuthEvent(
  entry: Omit<VoiceAuthAuditEntry, 'id' | 'timestamp'>
): Promise<string | null> {
  const fullEntry: VoiceAuthAuditEntry = {
    ...entry,
    timestamp: new Date(),
  };

  // Calculate risk score
  fullEntry.riskScore = calculateRiskScore(fullEntry);

  // Log to pino for immediate visibility
  const logLevel = entry.success ? 'info' : 'warn';
  log[logLevel](
    {
      action: entry.action,
      userId: entry.userId,
      success: entry.success,
      confidence: entry.confidence,
      riskScore: fullEntry.riskScore,
      anomalies: entry.anomalies,
    },
    'Voice auth event'
  );

  // Try to persist to Firestore
  const db = getFirestore();

  if (db) {
    try {
      const docRef = await db.collection(COLLECTION_NAME).add(
        removeUndefined({
          ...fullEntry,
          timestamp: admin.firestore.Timestamp.fromDate(fullEntry.timestamp),
        })
      );
      return docRef.id;
    } catch (error) {
      log.error({ error }, 'Failed to persist audit log to Firestore');
    }
  }

  // Fallback to in-memory storage
  const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  fullEntry.id = id;

  inMemoryAuditLog.push(fullEntry);

  // Trim in-memory log if too large
  while (inMemoryAuditLog.length > MAX_IN_MEMORY_ENTRIES) {
    inMemoryAuditLog.shift();
  }

  return id;
}

/**
 * Log enrollment start.
 */
export async function logEnrollmentStart(
  userId: string,
  deviceInfo: VoiceAuthAuditEntry['deviceInfo'],
  sessionId?: string
): Promise<string | null> {
  return logVoiceAuthEvent({
    action: 'enroll_start',
    userId,
    success: true,
    deviceInfo,
    sessionId,
  });
}

/**
 * Log enrollment sample.
 */
export async function logEnrollmentSample(
  userId: string,
  sampleNumber: number,
  quality: number,
  deviceInfo: VoiceAuthAuditEntry['deviceInfo']
): Promise<string | null> {
  return logVoiceAuthEvent({
    action: 'enroll_sample',
    userId,
    success: true,
    confidence: quality,
    deviceInfo,
    details: { sampleNumber },
  });
}

/**
 * Log enrollment completion.
 */
export async function logEnrollmentComplete(
  userId: string,
  qualityScore: number,
  sampleCount: number,
  deviceInfo: VoiceAuthAuditEntry['deviceInfo']
): Promise<string | null> {
  return logVoiceAuthEvent({
    action: 'enroll_complete',
    userId,
    success: true,
    confidence: qualityScore,
    deviceInfo,
    details: { sampleCount },
  });
}

/**
 * Log enrollment failure.
 */
export async function logEnrollmentFail(
  userId: string,
  reason: string,
  deviceInfo: VoiceAuthAuditEntry['deviceInfo']
): Promise<string | null> {
  return logVoiceAuthEvent({
    action: 'enroll_fail',
    userId,
    success: false,
    deviceInfo,
    anomalies: [reason],
    details: { reason },
  });
}

/**
 * Log verification attempt.
 */
export async function logVerification(
  userId: string,
  success: boolean,
  confidence: number,
  deviceInfo: VoiceAuthAuditEntry['deviceInfo'],
  details?: Record<string, unknown>
): Promise<string | null> {
  return logVoiceAuthEvent({
    action: success ? 'verify_success' : 'verify_fail',
    userId,
    success,
    confidence,
    deviceInfo,
    details,
    anomalies: !success ? ['Verification failed'] : undefined,
  });
}

/**
 * Log identification attempt.
 */
export async function logIdentification(
  identifiedUserId: string | null,
  success: boolean,
  confidence: number,
  candidateCount: number,
  deviceInfo: VoiceAuthAuditEntry['deviceInfo']
): Promise<string | null> {
  return logVoiceAuthEvent({
    action: success ? 'identify_success' : 'identify_fail',
    userId: identifiedUserId || 'unknown',
    success,
    confidence,
    deviceInfo,
    details: { candidateCount },
  });
}

/**
 * Log liveness check failure.
 */
export async function logLivenessFail(
  userId: string,
  confidence: number,
  failedChecks: string[],
  deviceInfo: VoiceAuthAuditEntry['deviceInfo']
): Promise<string | null> {
  return logVoiceAuthEvent({
    action: 'liveness_fail',
    userId,
    success: false,
    confidence,
    deviceInfo,
    anomalies: failedChecks,
    details: { failedChecks },
  });
}

/**
 * Log spoof detection.
 */
export async function logSpoofDetected(
  userId: string,
  spoofType: string,
  confidence: number,
  indicators: string[],
  deviceInfo: VoiceAuthAuditEntry['deviceInfo']
): Promise<string | null> {
  return logVoiceAuthEvent({
    action: 'spoof_detected',
    userId,
    success: false,
    confidence,
    deviceInfo,
    anomalies: [`Spoof detected: ${spoofType}`, ...indicators],
    details: { spoofType, indicators },
  });
}

/**
 * Log profile deletion.
 */
export async function logProfileDelete(
  userId: string,
  deviceInfo: VoiceAuthAuditEntry['deviceInfo']
): Promise<string | null> {
  return logVoiceAuthEvent({
    action: 'profile_delete',
    userId,
    success: true,
    deviceInfo,
  });
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Query audit logs.
 */
export async function queryAuditLogs(options: AuditQueryOptions): Promise<VoiceAuthAuditEntry[]> {
  const db = getFirestore();

  if (db) {
    try {
      let query: admin.firestore.Query = db.collection(COLLECTION_NAME);

      if (options.userId) {
        query = query.where('userId', '==', options.userId);
      }

      if (options.action) {
        if (Array.isArray(options.action)) {
          query = query.where('action', 'in', options.action);
        } else {
          query = query.where('action', '==', options.action);
        }
      }

      if (options.success !== undefined) {
        query = query.where('success', '==', options.success);
      }

      if (options.startDate) {
        query = query.where(
          'timestamp',
          '>=',
          admin.firestore.Timestamp.fromDate(options.startDate)
        );
      }

      if (options.endDate) {
        query = query.where('timestamp', '<=', admin.firestore.Timestamp.fromDate(options.endDate));
      }

      query = query.orderBy('timestamp', 'desc');

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const snapshot = await query.get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp.toDate(),
        } as VoiceAuthAuditEntry;
      });
    } catch (error) {
      log.error({ error }, 'Failed to query audit logs from Firestore');
    }
  }

  // Fallback to in-memory
  let results = [...inMemoryAuditLog];

  if (options.userId) {
    results = results.filter((e) => e.userId === options.userId);
  }

  if (options.action) {
    const actions = Array.isArray(options.action) ? options.action : [options.action];
    results = results.filter((e) => actions.includes(e.action));
  }

  if (options.success !== undefined) {
    results = results.filter((e) => e.success === options.success);
  }

  if (options.startDate) {
    results = results.filter((e) => e.timestamp >= options.startDate!);
  }

  if (options.endDate) {
    results = results.filter((e) => e.timestamp <= options.endDate!);
  }

  // Sort by timestamp descending
  results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  if (options.limit) {
    results = results.slice(0, options.limit);
  }

  return results;
}

/**
 * Get audit statistics.
 */
export async function getAuditStats(startDate?: Date, endDate?: Date): Promise<AuditStats> {
  const logs = await queryAuditLogs({
    startDate,
    endDate,
    limit: 10000, // Get a large sample
  });

  const totalEvents = logs.length;
  const successfulEvents = logs.filter((e) => e.success).length;
  const successRate = totalEvents > 0 ? successfulEvents / totalEvents : 0;
  const failedAttempts = totalEvents - successfulEvents;

  const uniqueUsers = new Set(logs.map((e) => e.userId)).size;
  const anomalyCount = logs.filter((e) => e.anomalies && e.anomalies.length > 0).length;

  // Count actions
  const actionCounts = new Map<VoiceAuthAction, number>();
  for (const entry of logs) {
    const count = actionCounts.get(entry.action) || 0;
    actionCounts.set(entry.action, count + 1);
  }

  const topActions = Array.from(actionCounts.entries())
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const recentActivity = logs.slice(0, 10);

  return {
    totalEvents,
    successRate,
    failedAttempts,
    uniqueUsers,
    anomalyCount,
    topActions,
    recentActivity,
  };
}

/**
 * Get user's recent auth history.
 */
export async function getUserAuthHistory(
  userId: string,
  limit = 50
): Promise<VoiceAuthAuditEntry[]> {
  return queryAuditLogs({
    userId,
    limit,
  });
}

/**
 * Check for suspicious activity patterns.
 */
export async function checkSuspiciousActivity(userId: string): Promise<{
  isSuspicious: boolean;
  reasons: string[];
  recentFailures: number;
  riskScore: number;
}> {
  const reasons: string[] = [];
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const recentLogs = await queryAuditLogs({
    userId,
    startDate: oneHourAgo,
  });

  // Count recent failures
  const recentFailures = recentLogs.filter((e) => !e.success).length;

  // Check for rapid failures
  if (recentFailures >= 5) {
    reasons.push(`${recentFailures} failed attempts in last hour`);
  }

  // Check for liveness failures
  const livenessFailures = recentLogs.filter((e) => e.action === 'liveness_fail').length;
  if (livenessFailures >= 2) {
    reasons.push(`${livenessFailures} liveness check failures`);
  }

  // Check for spoof detections
  const spoofDetections = recentLogs.filter((e) => e.action === 'spoof_detected').length;
  if (spoofDetections >= 1) {
    reasons.push(`${spoofDetections} spoof detection(s)`);
  }

  // Calculate risk score
  let riskScore = 0;
  riskScore += recentFailures * 0.1;
  riskScore += livenessFailures * 0.3;
  riskScore += spoofDetections * 0.5;
  riskScore = Math.min(1, riskScore);

  return {
    isSuspicious: reasons.length > 0,
    reasons,
    recentFailures,
    riskScore,
  };
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up old audit logs (retention policy).
 */
export async function cleanupOldAuditLogs(): Promise<number> {
  const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffDate);

  const db = getFirestore();
  let totalDeleted = 0;

  if (db) {
    try {
      // Loop until all old logs are cleaned (handle >500 logs)
      while (true) {
        const oldLogs = await db
          .collection(COLLECTION_NAME)
          .where('timestamp', '<', cutoffTimestamp)
          .limit(FIRESTORE_BATCH_LIMIT)
          .get();

        if (oldLogs.empty) break;

        const batch = db.batch();
        oldLogs.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        totalDeleted += oldLogs.size;

        // If we got fewer than the limit, we're done
        if (oldLogs.size < FIRESTORE_BATCH_LIMIT) break;
      }

      if (totalDeleted > 0) {
        log.info({ deleted: totalDeleted }, 'Cleaned up old audit logs');
      }
      return totalDeleted;
    } catch (error) {
      log.error({ error }, 'Failed to cleanup audit logs');
    }
  }

  // Cleanup in-memory
  const cutoffTime = cutoffDate.getTime();
  const beforeCount = inMemoryAuditLog.length;

  while (inMemoryAuditLog.length > 0 && inMemoryAuditLog[0].timestamp.getTime() < cutoffTime) {
    inMemoryAuditLog.shift();
  }

  return beforeCount - inMemoryAuditLog.length + totalDeleted;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate risk score for an event.
 */
function calculateRiskScore(entry: VoiceAuthAuditEntry): number {
  let score = 0;

  // Failed events increase risk
  if (!entry.success) {
    score += 0.2;
  }

  // Low confidence increases risk
  if (entry.confidence !== undefined && entry.confidence < 0.7) {
    score += 0.2 * (0.7 - entry.confidence);
  }

  // Anomalies increase risk
  if (entry.anomalies && entry.anomalies.length > 0) {
    score += 0.1 * entry.anomalies.length;
  }

  // Security-related actions have higher base risk
  if (['liveness_fail', 'spoof_detected'].includes(entry.action)) {
    score += 0.4;
  }

  return Math.min(1, score);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  logVoiceAuthEvent,
  logEnrollmentStart,
  logEnrollmentSample,
  logEnrollmentComplete,
  logEnrollmentFail,
  logVerification,
  logIdentification,
  logLivenessFail,
  logSpoofDetected,
  logProfileDelete,
  queryAuditLogs,
  getAuditStats,
  getUserAuthHistory,
  checkSuspiciousActivity,
  cleanupOldAuditLogs,
};
