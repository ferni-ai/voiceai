/**
 * Transaction Audit Log - Track All Autonomous Actions
 *
 * Comprehensive audit trail for all actions Ferni takes on behalf of users.
 * Essential for trust, debugging, and compliance.
 *
 * @module services/automation/audit-log
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'AuditLog' });

// ============================================================================
// Types
// ============================================================================

export type AuditActionCategory =
  | 'messaging'
  | 'calendar'
  | 'booking'
  | 'ordering'
  | 'smart_home'
  | 'financial'
  | 'notification'
  | 'task'
  | 'data_access';

export type AuditStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed' | 'cancelled' | 'undone';

export interface AuditEntry {
  id: string;
  userId: string;
  category: AuditActionCategory;
  actionType: string;
  description: string;
  status: AuditStatus;

  // Request details
  requestedAt: string;
  requestedBy: 'user' | 'ferni' | 'automation' | 'scheduled';
  personaId?: string;

  // Approval details
  approvalRequired: boolean;
  approvedAt?: string;
  rejectedAt?: string;
  approvalMethod?: 'auto' | 'voice' | 'ui' | 'push';

  // Execution details
  executedAt?: string;
  executionDuration?: number; // ms
  result?: 'success' | 'partial' | 'failure';
  errorMessage?: string;

  // Undo details
  canUndo: boolean;
  undoneAt?: string;
  undoReason?: string;

  // Context
  triggerSource?: string; // What triggered this action
  relatedInsightId?: string;
  relatedRuleId?: string;

  // Affected resources
  affectedResources?: Array<{
    type: string;
    id: string;
    name?: string;
  }>;

  // Financial impact
  monetaryValue?: number;
  currency?: string;

  // Metadata
  metadata?: Record<string, unknown>;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditQuery {
  userId?: string;
  category?: AuditActionCategory;
  status?: AuditStatus | AuditStatus[];
  actionType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface AuditSummary {
  totalActions: number;
  byStatus: Record<AuditStatus, number>;
  byCategory: Record<string, number>;
  recentActions: AuditEntry[];
  pendingActions: number;
  failureRate: number;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Log a new action to the audit trail
 */
export async function logAction(
  entry: Omit<AuditEntry, 'id' | 'requestedAt'>
): Promise<AuditEntry> {
  const db = getFirestoreDb();

  const auditEntry: AuditEntry = {
    ...entry,
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    requestedAt: new Date().toISOString(),
  };

  if (db) {
    try {
      // Store in user's audit log
      await db
        .collection('bogle_users')
        .doc(entry.userId)
        .collection('audit_log')
        .doc(auditEntry.id)
        .set(auditEntry);

      // Also store in global audit log for admin review
      await db.collection('global_audit_log').doc(auditEntry.id).set({
        ...auditEntry,
        // Remove any PII for global log
        metadata: undefined,
      });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to store audit entry');
    }
  }

  log.info(
    {
      auditId: auditEntry.id,
      userId: entry.userId,
      category: entry.category,
      actionType: entry.actionType,
      status: entry.status,
    },
    'Audit entry logged'
  );

  return auditEntry;
}

/**
 * Update an existing audit entry
 */
export async function updateAuditEntry(
  userId: string,
  auditId: string,
  updates: Partial<AuditEntry>
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('audit_log')
      .doc(auditId)
      .update(updates);

    // Update global log status only
    if (updates.status) {
      await db.collection('global_audit_log').doc(auditId).update({
        status: updates.status,
        executedAt: updates.executedAt,
        result: updates.result,
        errorMessage: updates.errorMessage,
        undoneAt: updates.undoneAt,
      });
    }

    log.debug({ auditId, updates: Object.keys(updates) }, 'Audit entry updated');
  } catch (error) {
    log.error({ error: String(error), auditId }, 'Failed to update audit entry');
  }
}

/**
 * Mark an action as approved
 */
export async function markApproved(
  userId: string,
  auditId: string,
  method: AuditEntry['approvalMethod'] = 'ui'
): Promise<void> {
  await updateAuditEntry(userId, auditId, {
    status: 'approved',
    approvedAt: new Date().toISOString(),
    approvalMethod: method,
  });
}

/**
 * Mark an action as rejected
 */
export async function markRejected(userId: string, auditId: string): Promise<void> {
  await updateAuditEntry(userId, auditId, {
    status: 'rejected',
    rejectedAt: new Date().toISOString(),
  });
}

/**
 * Mark an action as executed
 */
export async function markExecuted(
  userId: string,
  auditId: string,
  result: AuditEntry['result'],
  duration?: number,
  errorMessage?: string
): Promise<void> {
  await updateAuditEntry(userId, auditId, {
    status: result === 'failure' ? 'failed' : 'executed',
    executedAt: new Date().toISOString(),
    executionDuration: duration,
    result,
    errorMessage,
  });
}

/**
 * Mark an action as undone
 */
export async function markUndone(
  userId: string,
  auditId: string,
  reason?: string
): Promise<void> {
  await updateAuditEntry(userId, auditId, {
    status: 'undone',
    undoneAt: new Date().toISOString(),
    undoReason: reason,
  });
}

/**
 * Query audit log
 */
export async function queryAuditLog(query: AuditQuery): Promise<AuditEntry[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    let ref = query.userId
      ? db.collection('bogle_users').doc(query.userId).collection('audit_log')
      : db.collection('global_audit_log');

    // Apply filters
    if (query.category) {
      ref = ref.where('category', '==', query.category) as typeof ref;
    }

    if (query.status) {
      if (Array.isArray(query.status)) {
        ref = ref.where('status', 'in', query.status) as typeof ref;
      } else {
        ref = ref.where('status', '==', query.status) as typeof ref;
      }
    }

    if (query.actionType) {
      ref = ref.where('actionType', '==', query.actionType) as typeof ref;
    }

    if (query.startDate) {
      ref = ref.where('requestedAt', '>=', query.startDate.toISOString()) as typeof ref;
    }

    if (query.endDate) {
      ref = ref.where('requestedAt', '<=', query.endDate.toISOString()) as typeof ref;
    }

    // Apply ordering and pagination
    const snapshot = await ref
      .orderBy('requestedAt', 'desc')
      .limit(query.limit || 100)
      .offset(query.offset || 0)
      .get();

    return snapshot.docs.map((doc) => doc.data() as AuditEntry);
  } catch (error) {
    log.error({ error: String(error), query }, 'Audit log query failed');
    return [];
  }
}

/**
 * Get audit summary for a user
 */
export async function getAuditSummary(
  userId: string,
  days = 30
): Promise<AuditSummary> {
  const db = getFirestoreDb();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const summary: AuditSummary = {
    totalActions: 0,
    byStatus: {
      pending: 0,
      approved: 0,
      rejected: 0,
      executed: 0,
      failed: 0,
      cancelled: 0,
      undone: 0,
    },
    byCategory: {},
    recentActions: [],
    pendingActions: 0,
    failureRate: 0,
  };

  if (!db) return summary;

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('audit_log')
      .where('requestedAt', '>=', startDate.toISOString())
      .orderBy('requestedAt', 'desc')
      .get();

    summary.totalActions = snapshot.size;

    let executedCount = 0;
    let failedCount = 0;

    for (const doc of snapshot.docs) {
      const entry = doc.data() as AuditEntry;

      // Count by status
      summary.byStatus[entry.status]++;

      // Count by category
      summary.byCategory[entry.category] = (summary.byCategory[entry.category] || 0) + 1;

      // Track for failure rate
      if (entry.status === 'executed') executedCount++;
      if (entry.status === 'failed') failedCount++;
    }

    // Get recent actions
    summary.recentActions = snapshot.docs.slice(0, 10).map((doc) => doc.data() as AuditEntry);

    // Calculate failure rate
    const totalAttempted = executedCount + failedCount;
    summary.failureRate = totalAttempted > 0 ? failedCount / totalAttempted : 0;

    summary.pendingActions = summary.byStatus.pending;

    return summary;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get audit summary');
    return summary;
  }
}

/**
 * Get all undoable actions for a user
 */
export async function getUndoableActions(userId: string): Promise<AuditEntry[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    // Get recently executed actions that can be undone
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('audit_log')
      .where('status', '==', 'executed')
      .where('canUndo', '==', true)
      .where('executedAt', '>=', oneHourAgo.toISOString())
      .orderBy('executedAt', 'desc')
      .limit(20)
      .get();

    return snapshot.docs.map((doc) => doc.data() as AuditEntry);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get undoable actions');
    return [];
  }
}

/**
 * Clean up old audit entries (for data retention compliance)
 */
export async function cleanupOldEntries(
  retentionDays = 365
): Promise<{ deleted: number; errors: number }> {
  const db = getFirestoreDb();
  if (!db) return { deleted: 0, errors: 0 };

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  let deleted = 0;
  let errors = 0;

  try {
    // Clean up global audit log
    const snapshot = await db
      .collection('global_audit_log')
      .where('requestedAt', '<', cutoffDate.toISOString())
      .limit(500)
      .get();

    const batch = db.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
      deleted++;
    }

    await batch.commit();

    log.info({ deleted, retentionDays }, 'Cleaned up old audit entries');
  } catch (error) {
    log.error({ error: String(error) }, 'Audit cleanup failed');
    errors++;
  }

  return { deleted, errors };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Log a messaging action
 */
export async function logMessagingAction(
  userId: string,
  actionType: 'send_sms' | 'send_email',
  recipientName: string,
  requestedBy: AuditEntry['requestedBy'],
  approvalRequired: boolean
): Promise<AuditEntry> {
  return logAction({
    userId,
    category: 'messaging',
    actionType,
    description: `${actionType === 'send_sms' ? 'Send SMS' : 'Send email'} to ${recipientName}`,
    status: approvalRequired ? 'pending' : 'approved',
    requestedBy,
    approvalRequired,
    canUndo: false,
    affectedResources: [{ type: 'contact', id: recipientName, name: recipientName }],
  });
}

/**
 * Log a calendar action
 */
export async function logCalendarAction(
  userId: string,
  actionType: 'create_event' | 'modify_event' | 'delete_event',
  eventTitle: string,
  requestedBy: AuditEntry['requestedBy'],
  approvalRequired: boolean
): Promise<AuditEntry> {
  return logAction({
    userId,
    category: 'calendar',
    actionType,
    description: `${actionType.replace('_', ' ')}: ${eventTitle}`,
    status: approvalRequired ? 'pending' : 'approved',
    requestedBy,
    approvalRequired,
    canUndo: actionType !== 'delete_event',
    affectedResources: [{ type: 'calendar_event', id: eventTitle, name: eventTitle }],
  });
}

/**
 * Log a booking action
 */
export async function logBookingAction(
  userId: string,
  actionType: 'book_restaurant' | 'book_ride',
  description: string,
  monetaryValue: number,
  requestedBy: AuditEntry['requestedBy']
): Promise<AuditEntry> {
  return logAction({
    userId,
    category: 'booking',
    actionType,
    description,
    status: 'pending', // Bookings always require approval
    requestedBy,
    approvalRequired: true,
    canUndo: true,
    monetaryValue,
    currency: 'USD',
  });
}

// ============================================================================
// Exports
// ============================================================================

export const auditLog = {
  log: logAction,
  update: updateAuditEntry,
  markApproved,
  markRejected,
  markExecuted,
  markUndone,
  query: queryAuditLog,
  getSummary: getAuditSummary,
  getUndoable: getUndoableActions,
  cleanup: cleanupOldEntries,
  logMessaging: logMessagingAction,
  logCalendar: logCalendarAction,
  logBooking: logBookingAction,
};

export default auditLog;
