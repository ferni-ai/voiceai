/**
 * Scheduled Multi-Outreach Storage
 *
 * Handles storing and retrieving scheduled outreach targets from Firestore.
 * Integrates with the automated scheduler for execution.
 *
 * Storage: bogle_users/{userId}/scheduled_outreach/{id}
 *
 * @module services/outreach/scheduled-multi-outreach
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'ScheduledMultiOutreach' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Target details for scheduled outreach
 */
export interface ScheduledOutreachTarget {
  /** Original contact name/query */
  contact: string;
  /** Purpose of the outreach */
  purpose: string;
  /** Channel preference */
  channel: 'call' | 'text' | 'email' | 'conversation' | 'auto';
  /** Custom message (optional) */
  message?: string;
  /** Resolved contact ID */
  resolvedContactId: string;
  /** Resolved contact name */
  resolvedContactName: string;
  /** Resolved phone number */
  resolvedPhone?: string;
  /** Resolved email */
  resolvedEmail?: string;
}

/**
 * Scheduled outreach record in Firestore
 */
export interface ScheduledOutreach {
  id: string;
  userId: string;
  personaId: string;
  target: ScheduledOutreachTarget;
  scheduledFor: Date;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
  batchId?: string;
  executedAt?: Date;
  result?: {
    success: boolean;
    channel?: string;
    error?: string;
  };
  retryCount: number;
  maxRetries: number;
}

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

let db: FirebaseFirestore.Firestore | null = null;
let dbInitPromise: Promise<FirebaseFirestore.Firestore | null> | null = null;

async function getFirestore(): Promise<FirebaseFirestore.Firestore | null> {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = initializeFirestore();
  return dbInitPromise;
}

async function initializeFirestore(): Promise<FirebaseFirestore.Firestore | null> {
  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    return db;
  } catch (error) {
    log.warn({ error: String(error) }, 'Firestore not available for scheduled outreach');
    dbInitPromise = null;
    return null;
  }
}

// ============================================================================
// STORAGE FUNCTIONS
// ============================================================================

/**
 * Schedule an outreach for later execution
 */
export async function scheduleOutreach(
  userId: string,
  personaId: string,
  target: ScheduledOutreachTarget,
  scheduledFor: Date,
  batchId?: string
): Promise<string> {
  const firestore = await getFirestore();
  if (!firestore) {
    throw new Error('Firestore not available');
  }

  const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();

  const record: ScheduledOutreach = {
    id,
    userId,
    personaId,
    target,
    scheduledFor,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    batchId,
    retryCount: 0,
    maxRetries: 3,
  };

  await firestore
    .collection('bogle_users')
    .doc(userId)
    .collection('scheduled_outreach')
    .doc(id)
    .set(cleanForFirestore(record));

  log.info(
    {
      id,
      userId,
      contact: target.resolvedContactName,
      scheduledFor: scheduledFor.toISOString(),
    },
    '📅 Scheduled outreach saved'
  );

  return id;
}

/**
 * Get pending scheduled outreach for a user
 */
export async function getPendingOutreach(userId: string): Promise<ScheduledOutreach[]> {
  const firestore = await getFirestore();
  if (!firestore) return [];

  try {
    const snapshot = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('scheduled_outreach')
      .where('status', '==', 'pending')
      .where('scheduledFor', '<=', new Date())
      .orderBy('scheduledFor', 'asc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        scheduledFor: data.scheduledFor?.toDate?.() || new Date(data.scheduledFor),
        createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
        updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
        executedAt: data.executedAt?.toDate?.() || undefined,
      } as ScheduledOutreach;
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get pending outreach');
    return [];
  }
}

/**
 * Get all scheduled outreach for a user (for UI display)
 */
export async function getScheduledOutreach(
  userId: string,
  options: {
    status?: ScheduledOutreach['status'];
    limit?: number;
  } = {}
): Promise<ScheduledOutreach[]> {
  const firestore = await getFirestore();
  if (!firestore) return [];

  try {
    let query = firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('scheduled_outreach')
      .orderBy('scheduledFor', 'asc');

    if (options.status) {
      query = query.where('status', '==', options.status);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        scheduledFor: data.scheduledFor?.toDate?.() || new Date(data.scheduledFor),
        createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
        updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
        executedAt: data.executedAt?.toDate?.() || undefined,
      } as ScheduledOutreach;
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get scheduled outreach');
    return [];
  }
}

/**
 * Update outreach status
 */
export async function updateOutreachStatus(
  userId: string,
  outreachId: string,
  status: ScheduledOutreach['status'],
  result?: ScheduledOutreach['result']
): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) {
    log.warn({ userId, outreachId }, 'Cannot update status - Firestore not available');
    return;
  }

  try {
    const updateData: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };

    if (result) {
      updateData.result = result;
      updateData.executedAt = new Date();
    }

    await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('scheduled_outreach')
      .doc(outreachId)
      .update(cleanForFirestore(updateData));

    log.debug({ userId, outreachId, status }, 'Outreach status updated');
  } catch (error) {
    log.error({ error: String(error), userId, outreachId }, 'Failed to update outreach status');
  }
}

/**
 * Increment retry count and optionally mark as failed
 */
export async function incrementRetry(
  userId: string,
  outreachId: string
): Promise<{ shouldRetry: boolean; retryCount: number }> {
  const firestore = await getFirestore();
  if (!firestore) {
    return { shouldRetry: false, retryCount: 0 };
  }

  try {
    const doc = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('scheduled_outreach')
      .doc(outreachId)
      .get();

    if (!doc.exists) {
      return { shouldRetry: false, retryCount: 0 };
    }

    const data = doc.data() as ScheduledOutreach;
    const newRetryCount = (data.retryCount || 0) + 1;
    const shouldRetry = newRetryCount < (data.maxRetries || 3);

    await doc.ref.update(
      cleanForFirestore({
        retryCount: newRetryCount,
        status: shouldRetry ? 'pending' : 'failed',
        updatedAt: new Date(),
      })
    );

    return { shouldRetry, retryCount: newRetryCount };
  } catch (error) {
    log.error({ error: String(error), userId, outreachId }, 'Failed to increment retry');
    return { shouldRetry: false, retryCount: 0 };
  }
}

/**
 * Cancel a scheduled outreach
 */
export async function cancelScheduledOutreach(
  userId: string,
  outreachId: string
): Promise<boolean> {
  const firestore = await getFirestore();
  if (!firestore) return false;

  try {
    await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('scheduled_outreach')
      .doc(outreachId)
      .update(
        cleanForFirestore({
          status: 'cancelled',
          updatedAt: new Date(),
        })
      );

    log.info({ userId, outreachId }, 'Scheduled outreach cancelled');
    return true;
  } catch (error) {
    log.error({ error: String(error), userId, outreachId }, 'Failed to cancel scheduled outreach');
    return false;
  }
}

/**
 * Delete old completed/failed/cancelled outreach records
 * Called by cleanup jobs
 */
export async function cleanupOldOutreach(
  userId: string,
  olderThanDays: number = 30
): Promise<number> {
  const firestore = await getFirestore();
  if (!firestore) return 0;

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const snapshot = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('scheduled_outreach')
      .where('status', 'in', ['completed', 'failed', 'cancelled'])
      .where('updatedAt', '<', cutoff)
      .limit(100)
      .get();

    if (snapshot.empty) return 0;

    const batch = firestore.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    log.info({ userId, deleted: snapshot.size, olderThanDays }, 'Cleaned up old scheduled outreach');
    return snapshot.size;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to cleanup old outreach');
    return 0;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  scheduleOutreach,
  getPendingOutreach,
  getScheduledOutreach,
  updateOutreachStatus,
  incrementRetry,
  cancelScheduledOutreach,
  cleanupOldOutreach,
};
