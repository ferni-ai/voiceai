/**
 * Firestore Persistence for Outreach System
 *
 * Persists outreach data to Firestore for durability across restarts.
 * This replaces the in-memory Maps with database-backed storage.
 *
 * Collections:
 * - outreach_profiles/{userId} - User preferences and patterns
 * - outreach_triggers/{triggerId} - Pending triggers
 * - outreach_history/{userId}/records/{recordId} - Historical outreach
 * - outreach_context/{userId} - User life context
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { OutreachTrigger, OutreachDecision, UserOutreachState } from './decision-engine.js';
import type { UserLifeContext } from './context-aggregator.js';
import type { TimingProfile } from './timing-intelligence.js';
import type { ChannelProfile } from './channel-selector.js';
import type { RelationshipProfile } from './relationship-adapter.js';

const log = getLogger().child({ module: 'outreach-firestore' });

// ============================================================================
// TYPES
// ============================================================================

export interface OutreachProfileDocument {
  userId: string;
  state: UserOutreachState;
  timing: Partial<TimingProfile>;
  channel: Partial<ChannelProfile>;
  relationship: Partial<RelationshipProfile>;
  updatedAt: Date;
  createdAt: Date;
}

export interface OutreachTriggerDocument {
  id: string;
  userId: string;
  trigger: OutreachTrigger;
  status: 'pending' | 'processing' | 'sent' | 'cancelled' | 'failed';
  scheduledFor?: Date;
  processedAt?: Date;
  createdAt: Date;
}

export interface OutreachHistoryDocument {
  id: string;
  userId: string;
  decision: OutreachDecision;
  createdAt: Date;
}

// ============================================================================
// FIRESTORE CLIENT
// ============================================================================

let firestoreClient: FirebaseFirestore.Firestore | null = null;
let firestoreAvailable = false;

// Collection names
const COLLECTIONS = {
  PROFILES: 'outreach_profiles',
  TRIGGERS: 'outreach_triggers',
  HISTORY: 'outreach_history',
  CONTEXT: 'outreach_context',
} as const;

/**
 * Initialize Firestore for outreach persistence
 */
export async function initializeFirestore(): Promise<boolean> {
  try {
    // Dynamic import to avoid issues if Firebase isn't configured
    const admin = await import('firebase-admin');

    // Check if already initialized
    if (admin.apps.length === 0) {
      // Try to initialize with default credentials
      try {
        admin.initializeApp({
          projectId: process.env.GCP_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
        });
      } catch {
        log.warn('Firebase not configured - using in-memory storage');
        return false;
      }
    }

    firestoreClient = admin.firestore();
    firestoreAvailable = true;
    log.info('✅ Firestore initialized for outreach persistence');
    return true;
  } catch (error) {
    log.warn({ error }, 'Firestore not available - using in-memory storage');
    firestoreAvailable = false;
    return false;
  }
}

/**
 * Check if Firestore is available
 */
export function isFirestoreAvailable(): boolean {
  return firestoreAvailable && firestoreClient !== null;
}

// ============================================================================
// PROFILE PERSISTENCE
// ============================================================================

const PROFILES_COLLECTION = 'outreach_profiles';

/**
 * Save user outreach profile to Firestore
 */
export async function saveOutreachProfile(
  userId: string,
  data: {
    state?: UserOutreachState;
    timing?: Partial<TimingProfile>;
    channel?: Partial<ChannelProfile>;
    relationship?: Partial<RelationshipProfile>;
  }
): Promise<void> {
  if (!isFirestoreAvailable()) {
    log.debug({ userId }, 'Firestore unavailable - profile not persisted');
    return;
  }

  try {
    const docRef = firestoreClient!.collection(PROFILES_COLLECTION).doc(userId);
    const existing = await docRef.get();

    const now = new Date();
    const updateData: Partial<OutreachProfileDocument> = {
      userId,
      updatedAt: now,
      ...data,
    };

    if (!existing.exists) {
      updateData.createdAt = now;
    }

    await docRef.set(updateData, { merge: true });
    log.debug({ userId }, 'Saved outreach profile');
  } catch (error) {
    log.error({ error, userId }, 'Failed to save outreach profile');
  }
}

/**
 * Load user outreach profile from Firestore
 */
export async function loadOutreachProfile(userId: string): Promise<OutreachProfileDocument | null> {
  if (!isFirestoreAvailable()) {
    return null;
  }

  try {
    const docRef = firestoreClient!.collection(PROFILES_COLLECTION).doc(userId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return null;
    }

    return doc.data() as OutreachProfileDocument;
  } catch (error) {
    log.error({ error, userId }, 'Failed to load outreach profile');
    return null;
  }
}

/**
 * Delete user outreach profile (for GDPR)
 */
export async function deleteOutreachProfile(userId: string): Promise<void> {
  if (!isFirestoreAvailable()) {
    return;
  }

  try {
    await firestoreClient!.collection(PROFILES_COLLECTION).doc(userId).delete();
    log.info({ userId }, 'Deleted outreach profile');
  } catch (error) {
    log.error({ error, userId }, 'Failed to delete outreach profile');
  }
}

// ============================================================================
// TRIGGER PERSISTENCE
// ============================================================================

const TRIGGERS_COLLECTION = 'outreach_triggers';

/**
 * Save a trigger to Firestore
 */
export async function saveTrigger(trigger: OutreachTrigger, scheduledFor?: Date): Promise<void> {
  if (!isFirestoreAvailable()) {
    return;
  }

  try {
    const doc: OutreachTriggerDocument = {
      id: trigger.id,
      userId: trigger.userId,
      trigger,
      status: 'pending',
      scheduledFor,
      createdAt: new Date(),
    };

    await firestoreClient!.collection(TRIGGERS_COLLECTION).doc(trigger.id).set(doc);
    log.debug({ triggerId: trigger.id }, 'Saved trigger');
  } catch (error) {
    log.error({ error, triggerId: trigger.id }, 'Failed to save trigger');
  }
}

/**
 * Update trigger status
 */
export async function updateTriggerStatus(
  triggerId: string,
  status: OutreachTriggerDocument['status']
): Promise<void> {
  if (!isFirestoreAvailable()) {
    return;
  }

  try {
    await firestoreClient!
      .collection(TRIGGERS_COLLECTION)
      .doc(triggerId)
      .update({
        status,
        processedAt: status === 'sent' || status === 'failed' ? new Date() : null,
      });
  } catch (error) {
    log.error({ error, triggerId }, 'Failed to update trigger status');
  }
}

/**
 * Load pending triggers for a user
 */
export async function loadPendingTriggers(userId: string): Promise<OutreachTrigger[]> {
  if (!isFirestoreAvailable()) {
    return [];
  }

  try {
    const snapshot = await firestoreClient!
      .collection(TRIGGERS_COLLECTION)
      .where('userId', '==', userId)
      .where('status', '==', 'pending')
      .get();

    return snapshot.docs.map((doc) => (doc.data() as OutreachTriggerDocument).trigger);
  } catch (error) {
    log.error({ error, userId }, 'Failed to load pending triggers');
    return [];
  }
}

/**
 * Load all pending triggers (for startup recovery)
 */
export async function loadAllPendingTriggers(): Promise<OutreachTriggerDocument[]> {
  if (!isFirestoreAvailable()) {
    return [];
  }

  try {
    const snapshot = await firestoreClient!
      .collection(TRIGGERS_COLLECTION)
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'asc')
      .get();

    return snapshot.docs.map((doc) => doc.data() as OutreachTriggerDocument);
  } catch (error) {
    log.error({ error }, 'Failed to load all pending triggers');
    return [];
  }
}

/**
 * Delete a trigger
 */
export async function deleteTrigger(triggerId: string): Promise<void> {
  if (!isFirestoreAvailable()) {
    return;
  }

  try {
    await firestoreClient!.collection(TRIGGERS_COLLECTION).doc(triggerId).delete();
  } catch (error) {
    log.error({ error, triggerId }, 'Failed to delete trigger');
  }
}

/**
 * Clean up old processed triggers
 */
export async function cleanupOldTriggers(maxAgeDays = 7): Promise<number> {
  if (!isFirestoreAvailable()) {
    return 0;
  }

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);

    const snapshot = await firestoreClient!
      .collection(TRIGGERS_COLLECTION)
      .where('status', 'in', ['sent', 'cancelled', 'failed'])
      .where('createdAt', '<', cutoff)
      .limit(500)
      .get();

    const batch = firestoreClient!.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    log.info({ deleted: snapshot.size }, 'Cleaned up old triggers');
    return snapshot.size;
  } catch (error) {
    log.error({ error }, 'Failed to cleanup old triggers');
    return 0;
  }
}

// ============================================================================
// HISTORY PERSISTENCE
// ============================================================================

const HISTORY_COLLECTION = 'outreach_history';

/**
 * Save outreach decision to history
 */
export async function saveToHistory(userId: string, decision: OutreachDecision): Promise<void> {
  if (!isFirestoreAvailable()) {
    return;
  }

  try {
    const doc: OutreachHistoryDocument = {
      id: decision.trigger.id,
      userId,
      decision,
      createdAt: new Date(),
    };

    await firestoreClient!
      .collection(HISTORY_COLLECTION)
      .doc(userId)
      .collection('records')
      .doc(decision.trigger.id)
      .set(doc);

    log.debug({ userId, triggerId: decision.trigger.id }, 'Saved to history');
  } catch (error) {
    log.error({ error, userId }, 'Failed to save to history');
  }
}

/**
 * Load outreach history for a user
 */
export async function loadHistory(userId: string, limit = 50): Promise<OutreachDecision[]> {
  if (!isFirestoreAvailable()) {
    return [];
  }

  try {
    const snapshot = await firestoreClient!
      .collection(HISTORY_COLLECTION)
      .doc(userId)
      .collection('records')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => (doc.data() as OutreachHistoryDocument).decision);
  } catch (error) {
    log.error({ error, userId }, 'Failed to load history');
    return [];
  }
}

/**
 * Delete user history (for GDPR)
 */
export async function deleteUserHistory(userId: string): Promise<void> {
  if (!isFirestoreAvailable()) {
    return;
  }

  try {
    const snapshot = await firestoreClient!
      .collection(HISTORY_COLLECTION)
      .doc(userId)
      .collection('records')
      .get();

    const batch = firestoreClient!.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    // Delete the parent document
    await firestoreClient!.collection(HISTORY_COLLECTION).doc(userId).delete();

    log.info({ userId }, 'Deleted user history');
  } catch (error) {
    log.error({ error, userId }, 'Failed to delete user history');
  }
}

// ============================================================================
// CONTEXT PERSISTENCE
// ============================================================================

const CONTEXT_COLLECTION = 'outreach_context';

/**
 * Save user life context
 */
export async function saveContext(userId: string, context: UserLifeContext): Promise<void> {
  if (!isFirestoreAvailable()) {
    return;
  }

  try {
    await firestoreClient!.collection(CONTEXT_COLLECTION).doc(userId).set({
      userId,
      context,
      updatedAt: new Date(),
    });
  } catch (error) {
    log.error({ error, userId }, 'Failed to save context');
  }
}

/**
 * Load user life context
 */
export async function loadContext(userId: string): Promise<UserLifeContext | null> {
  if (!isFirestoreAvailable()) {
    return null;
  }

  try {
    const doc = await firestoreClient!.collection(CONTEXT_COLLECTION).doc(userId).get();

    if (!doc.exists) {
      return null;
    }

    return doc.data()?.context as UserLifeContext;
  } catch (error) {
    log.error({ error, userId }, 'Failed to load context');
    return null;
  }
}

/**
 * Delete user context (for GDPR)
 */
export async function deleteUserContext(userId: string): Promise<void> {
  if (!isFirestoreAvailable()) {
    return;
  }

  try {
    await firestoreClient!.collection(CONTEXT_COLLECTION).doc(userId).delete();
  } catch (error) {
    log.error({ error, userId }, 'Failed to delete context');
  }
}

// ============================================================================
// FULL USER DATA DELETION (GDPR)
// ============================================================================

/**
 * Delete all outreach data for a user
 */
export async function deleteAllUserOutreachData(userId: string): Promise<void> {
  log.info({ userId }, 'Deleting all outreach data for user');

  await Promise.all([
    deleteOutreachProfile(userId),
    deleteUserHistory(userId),
    deleteUserContext(userId),
  ]);

  // Also delete any pending triggers
  if (isFirestoreAvailable()) {
    try {
      const triggersSnapshot = await firestoreClient!
        .collection(TRIGGERS_COLLECTION)
        .where('userId', '==', userId)
        .get();

      const batch = firestoreClient!.batch();
      triggersSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    } catch (error) {
      log.error({ error, userId }, 'Failed to delete user triggers');
    }
  }

  log.info({ userId }, 'Completed deletion of all outreach data');
}

// ============================================================================
// ANALYTICS QUERIES
// ============================================================================

/**
 * Get outreach statistics for analytics
 */
export async function getOutreachStats(
  userId?: string,
  days = 30
): Promise<{
  totalSent: number;
  byChannel: Record<string, number>;
  byTrigger: Record<string, number>;
  responseRate: number;
}> {
  const defaultStats = {
    totalSent: 0,
    byChannel: {},
    byTrigger: {},
    responseRate: 0,
  };

  if (!isFirestoreAvailable()) {
    return defaultStats;
  }

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    let query = firestoreClient!.collectionGroup('records').where('createdAt', '>=', cutoff);

    if (userId) {
      query = query.where('userId', '==', userId);
    }

    const snapshot = await query.limit(1000).get();

    const stats: {
      totalSent: number;
      byChannel: Record<string, number>;
      byTrigger: Record<string, number>;
      responseRate: number;
    } = { ...defaultStats };

    snapshot.docs.forEach((doc) => {
      const data = doc.data() as OutreachHistoryDocument;
      if (data.decision.decision === 'send') {
        stats.totalSent++;

        const channel = data.decision.channel || 'unknown';
        stats.byChannel[channel] = (stats.byChannel[channel] || 0) + 1;

        const trigger = data.decision.trigger.type;
        stats.byTrigger[trigger] = (stats.byTrigger[trigger] || 0) + 1;
      }
    });

    return stats;
  } catch (error) {
    log.error({ error }, 'Failed to get outreach stats');
    return defaultStats;
  }
}

// ============================================================================
// DELIVERY RECORDS PERSISTENCE
// ============================================================================

export interface DeliveryRecordDocument {
  id: string;
  outreachId: string;
  userId: string;
  personaId: string;
  channel: string;
  status: string;
  externalId?: string;
  to: string;
  subject?: string;
  queuedAt: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  errorMessage?: string;
}

/**
 * Save a delivery record to Firestore
 */
export async function saveDeliveryRecord(record: DeliveryRecordDocument): Promise<void> {
  if (!isFirestoreAvailable()) return;

  try {
    const ref = firestoreClient!
      .collection(COLLECTIONS.HISTORY)
      .doc(record.userId)
      .collection('deliveries')
      .doc(record.id);

    await ref.set({
      ...record,
      queuedAt: record.queuedAt,
      sentAt: record.sentAt || null,
      deliveredAt: record.deliveredAt || null,
    });
  } catch (error) {
    log.error({ error, deliveryId: record.id }, 'Failed to save delivery record');
  }
}

/**
 * Update delivery status
 */
export async function updateDeliveryStatus(
  userId: string,
  deliveryId: string,
  status: string,
  details?: { deliveredAt?: Date; errorMessage?: string }
): Promise<void> {
  if (!isFirestoreAvailable()) return;

  try {
    const ref = firestoreClient!
      .collection(COLLECTIONS.HISTORY)
      .doc(userId)
      .collection('deliveries')
      .doc(deliveryId);

    await ref.update({
      status,
      ...details,
    });
  } catch (error) {
    log.error({ error, deliveryId }, 'Failed to update delivery status');
  }
}

/**
 * Load delivery records for a user
 */
export async function loadDeliveryRecords(
  userId: string,
  limit = 50
): Promise<DeliveryRecordDocument[]> {
  if (!isFirestoreAvailable()) return [];

  try {
    const ref = firestoreClient!
      .collection(COLLECTIONS.HISTORY)
      .doc(userId)
      .collection('deliveries')
      .orderBy('queuedAt', 'desc')
      .limit(limit);

    const snapshot = await ref.get();
    return snapshot.docs.map((doc) => doc.data() as DeliveryRecordDocument);
  } catch (error) {
    log.error({ error, userId }, 'Failed to load delivery records');
    return [];
  }
}

// ============================================================================
// A/B TEST PERSISTENCE
// ============================================================================

export interface ABTestDocument {
  id: string;
  name: string;
  type: string;
  status: string;
  variants: unknown[];
  controlVariantId: string;
  primaryMetric: string;
  minimumSamplePerVariant: number;
  significanceLevel: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  results?: unknown;
}

export interface ABTestAssignmentDocument {
  testId: string;
  variantId: string;
  userId: string;
  assignedAt: Date;
  converted: boolean;
  conversionAt?: Date;
}

/**
 * Save an A/B test to Firestore
 */
export async function saveABTest(test: ABTestDocument): Promise<void> {
  if (!isFirestoreAvailable()) return;

  try {
    const ref = firestoreClient!.collection('ab_tests').doc(test.id);
    await ref.set(test);
  } catch (error) {
    log.error({ error, testId: test.id }, 'Failed to save A/B test');
  }
}

/**
 * Update A/B test
 */
export async function updateABTest(
  testId: string,
  updates: Partial<ABTestDocument>
): Promise<void> {
  if (!isFirestoreAvailable()) return;

  try {
    const ref = firestoreClient!.collection('ab_tests').doc(testId);
    await ref.update(updates);
  } catch (error) {
    log.error({ error, testId }, 'Failed to update A/B test');
  }
}

/**
 * Load all active A/B tests
 */
export async function loadActiveABTests(): Promise<ABTestDocument[]> {
  if (!isFirestoreAvailable()) return [];

  try {
    const snapshot = await firestoreClient!
      .collection('ab_tests')
      .where('status', '==', 'running')
      .get();

    return snapshot.docs.map((doc) => doc.data() as ABTestDocument);
  } catch (error) {
    log.error({ error }, 'Failed to load active A/B tests');
    return [];
  }
}

/**
 * Save test assignment
 */
export async function saveTestAssignment(assignment: ABTestAssignmentDocument): Promise<void> {
  if (!isFirestoreAvailable()) return;

  try {
    const ref = firestoreClient!
      .collection('ab_tests')
      .doc(assignment.testId)
      .collection('assignments')
      .doc(assignment.userId);

    await ref.set(assignment);
  } catch (error) {
    log.error(
      { error, testId: assignment.testId, userId: assignment.userId },
      'Failed to save test assignment'
    );
  }
}

/**
 * Load user's test assignment
 */
export async function loadTestAssignment(
  testId: string,
  userId: string
): Promise<ABTestAssignmentDocument | null> {
  if (!isFirestoreAvailable()) return null;

  try {
    const ref = firestoreClient!
      .collection('ab_tests')
      .doc(testId)
      .collection('assignments')
      .doc(userId);

    const doc = await ref.get();
    return doc.exists ? (doc.data() as ABTestAssignmentDocument) : null;
  } catch (error) {
    log.error({ error, testId, userId }, 'Failed to load test assignment');
    return null;
  }
}

/**
 * Record conversion for A/B test
 */
export async function recordTestConversion(testId: string, userId: string): Promise<void> {
  if (!isFirestoreAvailable()) return;

  try {
    const ref = firestoreClient!
      .collection('ab_tests')
      .doc(testId)
      .collection('assignments')
      .doc(userId);

    await ref.update({
      converted: true,
      conversionAt: new Date(),
    });
  } catch (error) {
    log.error({ error, testId, userId }, 'Failed to record conversion');
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  initializeFirestore,
  isFirestoreAvailable,
  // Profiles
  saveOutreachProfile,
  loadOutreachProfile,
  deleteOutreachProfile,
  // Triggers
  saveTrigger,
  updateTriggerStatus,
  loadPendingTriggers,
  loadAllPendingTriggers,
  deleteTrigger,
  cleanupOldTriggers,
  // History
  saveToHistory,
  loadHistory,
  deleteUserHistory,
  // Context
  saveContext,
  loadContext,
  deleteUserContext,
  // Delivery records
  saveDeliveryRecord,
  updateDeliveryStatus,
  loadDeliveryRecords,
  // A/B Tests
  saveABTest,
  updateABTest,
  loadActiveABTests,
  saveTestAssignment,
  loadTestAssignment,
  recordTestConversion,
  // GDPR
  deleteAllUserOutreachData,
  // Analytics
  getOutreachStats,
};
