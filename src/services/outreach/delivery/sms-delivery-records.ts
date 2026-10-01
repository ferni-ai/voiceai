/**
 * SMS delivery records: in-memory record/retry state, status webhook
 * handling, lookups and cleanup. Extracted from sms-delivery.ts.
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { DeliveryRecord } from './sms-delivery-types.js';

const log = getLogger().child({ module: 'sms-delivery' });

export const deliveryRecords = new Map<string, DeliveryRecord>();
export const pendingRetries = new Map<string, NodeJS.Timeout>();

// Cleanup configuration - prevent unbounded memory growth
const MAX_DELIVERY_RECORDS = 10_000; // Max records to keep in memory
const RECORD_TTL_HOURS = 24; // Records older than this are cleaned up

// ============================================================================
// STATUS HANDLING
// ============================================================================

/**
 * Handle Twilio status webhook
 */
export function handleSMSStatus(
  messageSid: string,
  status: string,
  errorCode?: string,
  errorMessage?: string
): void {
  const record = deliveryRecords.get(messageSid);
  if (!record) {
    log.warn({ messageSid }, 'Received status for unknown message');
    return;
  }

  // Update record
  record.status = status as DeliveryRecord['status'];

  if (status === 'delivered') {
    record.deliveredAt = new Date();
    log.info({ messageSid, userId: record.userId }, '✅ SMS delivered');
  } else if (status === 'failed' || status === 'undelivered') {
    record.errorCode = errorCode;
    record.errorMessage = errorMessage;
    log.warn(
      { messageSid, userId: record.userId, errorCode, errorMessage },
      '❌ SMS delivery failed'
    );
  }

  deliveryRecords.set(messageSid, record);
}

/**
 * Get delivery record
 */
export function getDeliveryRecord(messageSid: string): DeliveryRecord | undefined {
  return deliveryRecords.get(messageSid);
}

/**
 * Get all delivery records for a user
 */
export function getUserDeliveryRecords(userId: string): DeliveryRecord[] {
  return Array.from(deliveryRecords.values()).filter((r) => r.userId === userId);
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Cancel pending retry
 */
export function cancelPendingRetry(outreachId: string): boolean {
  const timeout = pendingRetries.get(outreachId);
  if (timeout) {
    clearTimeout(timeout);
    pendingRetries.delete(outreachId);
    return true;
  }
  return false;
}

/**
 * Clear old delivery records
 */
export function clearOldRecords(maxAgeHours = RECORD_TTL_HOURS): number {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  let cleared = 0;
  for (const [sid, record] of deliveryRecords) {
    if (record.sentAt < cutoff) {
      deliveryRecords.delete(sid);
      cleared++;
    }
  }

  if (cleared > 0) {
    log.info({ cleared, maxAgeHours }, 'Cleared old SMS delivery records');
  }

  return cleared;
}

/**
 * Enforce max size limit by removing oldest records
 */
export function enforceMaxSize(): number {
  if (deliveryRecords.size <= MAX_DELIVERY_RECORDS) {
    return 0;
  }

  // Sort by sentAt and keep only the newest MAX_DELIVERY_RECORDS
  const sorted = Array.from(deliveryRecords.entries()).sort(
    ([, a], [, b]) => b.sentAt.getTime() - a.sentAt.getTime()
  );

  const toRemove = sorted.slice(MAX_DELIVERY_RECORDS);
  for (const [sid] of toRemove) {
    deliveryRecords.delete(sid);
  }

  log.info(
    { removed: toRemove.length, remaining: deliveryRecords.size },
    'Enforced max delivery records limit'
  );

  return toRemove.length;
}
