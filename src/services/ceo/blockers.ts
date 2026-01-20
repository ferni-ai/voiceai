/**
 * Blockers Service - Track and Manage Blockers
 *
 * Track blockers that are preventing progress on goals or tasks.
 * Stored in Firestore under users/{userId}/blockers/{blockerId}
 *
 * @module services/ceo/blockers
 */

import { Timestamp } from '@google-cloud/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import {
  getFirestoreDb,
  cleanForFirestore,
  recordDegradation,
  toSafeDate,
} from '../../utils/firestore-utils.js';
import { generateId } from '../../utils/id-generator.js';

const log = createLogger({ module: 'ceo-blockers' });

// ============================================================================
// TYPES
// ============================================================================

export type BlockerSeverity = 'low' | 'medium' | 'high' | 'critical';
export type BlockerStatus = 'active' | 'resolved' | 'escalated';

export interface Blocker {
  id: string;
  userId: string;
  description: string;
  linkedGoalId?: string;
  severity: BlockerSeverity;
  status: BlockerStatus;
  resolution?: string;
  escalatedTo?: string;
  resolvedAt?: Date;
  escalatedAt?: Date;
  createdAt: Date;
}

interface FirestoreBlocker {
  id: string;
  userId: string;
  description: string;
  linkedGoalId?: string;
  severity: BlockerSeverity;
  status: BlockerStatus;
  resolution?: string;
  escalatedTo?: string;
  resolvedAt?: Timestamp;
  escalatedAt?: Timestamp;
  createdAt: Timestamp;
}

// ============================================================================
// VALIDATION
// ============================================================================

const VALID_SEVERITIES: BlockerSeverity[] = ['low', 'medium', 'high', 'critical'];
const VALID_STATUSES: BlockerStatus[] = ['active', 'resolved', 'escalated'];

function validateSeverity(severity: string): asserts severity is BlockerSeverity {
  if (!VALID_SEVERITIES.includes(severity as BlockerSeverity)) {
    throw new Error(
      `Invalid severity: ${severity}. Must be one of: ${VALID_SEVERITIES.join(', ')}`
    );
  }
}

function validateStatus(status: string): asserts status is BlockerStatus {
  if (!VALID_STATUSES.includes(status as BlockerStatus)) {
    throw new Error(`Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }
}

// ============================================================================
// COLLECTION PATHS
// ============================================================================

const BLOCKERS_COLLECTION = 'blockers';

function getBlockersPath(userId: string): string {
  return `users/${userId}/${BLOCKERS_COLLECTION}`;
}

// ============================================================================
// HELPERS
// ============================================================================

function firestoreToBlocker(data: FirestoreBlocker): Blocker {
  return {
    id: data.id,
    userId: data.userId,
    description: data.description,
    linkedGoalId: data.linkedGoalId,
    severity: data.severity,
    status: data.status,
    resolution: data.resolution,
    escalatedTo: data.escalatedTo,
    resolvedAt: data.resolvedAt ? toSafeDate(data.resolvedAt) : undefined,
    escalatedAt: data.escalatedAt ? toSafeDate(data.escalatedAt) : undefined,
    createdAt: toSafeDate(data.createdAt),
  };
}

function blockerToFirestore(blocker: Blocker): FirestoreBlocker {
  const firestoreBlocker: FirestoreBlocker = {
    id: blocker.id,
    userId: blocker.userId,
    description: blocker.description,
    linkedGoalId: blocker.linkedGoalId,
    severity: blocker.severity,
    status: blocker.status,
    resolution: blocker.resolution,
    escalatedTo: blocker.escalatedTo,
    resolvedAt: blocker.resolvedAt ? Timestamp.fromDate(blocker.resolvedAt) : undefined,
    escalatedAt: blocker.escalatedAt ? Timestamp.fromDate(blocker.escalatedAt) : undefined,
    createdAt: Timestamp.fromDate(blocker.createdAt),
  };

  return firestoreBlocker;
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Add a new blocker.
 */
export async function addBlocker(
  userId: string,
  description: string,
  linkedGoalId?: string,
  severity: BlockerSeverity = 'medium'
): Promise<Blocker> {
  validateSeverity(severity);

  const db = getFirestoreDb();

  const blocker: Blocker = {
    id: generateId('blk'),
    userId,
    description,
    linkedGoalId,
    severity,
    status: 'active',
    createdAt: new Date(),
  };

  if (!db) {
    recordDegradation('ceo-blockers', 'addBlocker');
    log.warn({ userId }, 'Firestore unavailable, blocker not persisted');
    return blocker;
  }

  try {
    const docRef = db.collection(getBlockersPath(userId)).doc(blocker.id);
    await docRef.set(cleanForFirestore(blockerToFirestore(blocker)));

    log.info({ userId, blockerId: blocker.id, severity }, 'Blocker added');
    return blocker;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to add blocker');
    return blocker;
  }
}

/**
 * Get blockers for a user, optionally filtered by status.
 */
export async function getBlockers(userId: string, status?: BlockerStatus): Promise<Blocker[]> {
  if (status) {
    validateStatus(status);
  }

  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-blockers', 'getBlockers');
    return [];
  }

  try {
    const blockersRef = db.collection(getBlockersPath(userId));
    let query = blockersRef.orderBy('createdAt', 'desc');

    if (status) {
      query = blockersRef.where('status', '==', status).orderBy('createdAt', 'desc');
    }

    const snapshot = await query.limit(100).get();

    return snapshot.docs.map((doc) => firestoreToBlocker(doc.data() as FirestoreBlocker));
  } catch (error) {
    log.error({ error: String(error), userId, status }, 'Failed to get blockers');
    return [];
  }
}

/**
 * Get only active blockers.
 */
export async function getActiveBlockers(userId: string): Promise<Blocker[]> {
  return getBlockers(userId, 'active');
}

/**
 * Get a single blocker by ID.
 */
export async function getBlocker(userId: string, blockerId: string): Promise<Blocker | null> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-blockers', 'getBlocker');
    return null;
  }

  try {
    const docRef = db.collection(getBlockersPath(userId)).doc(blockerId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return null;
    }

    return firestoreToBlocker(doc.data() as FirestoreBlocker);
  } catch (error) {
    log.error({ error: String(error), userId, blockerId }, 'Failed to get blocker');
    return null;
  }
}

/**
 * Resolve a blocker with an optional resolution note.
 */
export async function resolveBlocker(
  userId: string,
  blockerId: string,
  resolution?: string
): Promise<Blocker> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-blockers', 'resolveBlocker');
    throw new Error('Database not available');
  }

  try {
    const docRef = db.collection(getBlockersPath(userId)).doc(blockerId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error('Blocker not found');
    }

    const existing = firestoreToBlocker(doc.data() as FirestoreBlocker);

    const updated: Blocker = {
      ...existing,
      status: 'resolved',
      resolution,
      resolvedAt: new Date(),
    };

    await docRef.set(cleanForFirestore(blockerToFirestore(updated)), { merge: true });

    log.info({ userId, blockerId }, 'Blocker resolved');
    return updated;
  } catch (error) {
    const errorMsg = String(error);
    if (errorMsg.includes('Blocker not found')) {
      throw error;
    }
    log.error({ error: errorMsg, userId, blockerId }, 'Failed to resolve blocker');
    throw new Error('Failed to resolve blocker');
  }
}

/**
 * Escalate a blocker with an optional escalation target.
 */
export async function escalateBlocker(
  userId: string,
  blockerId: string,
  escalatedTo?: string
): Promise<Blocker> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-blockers', 'escalateBlocker');
    throw new Error('Database not available');
  }

  try {
    const docRef = db.collection(getBlockersPath(userId)).doc(blockerId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error('Blocker not found');
    }

    const existing = firestoreToBlocker(doc.data() as FirestoreBlocker);

    const updated: Blocker = {
      ...existing,
      status: 'escalated',
      escalatedTo,
      escalatedAt: new Date(),
    };

    await docRef.set(cleanForFirestore(blockerToFirestore(updated)), { merge: true });

    log.info({ userId, blockerId, escalatedTo }, 'Blocker escalated');
    return updated;
  } catch (error) {
    const errorMsg = String(error);
    if (errorMsg.includes('Blocker not found')) {
      throw error;
    }
    log.error({ error: errorMsg, userId, blockerId }, 'Failed to escalate blocker');
    throw new Error('Failed to escalate blocker');
  }
}

/**
 * Get blockers linked to a specific goal.
 */
export async function getBlockersForGoal(userId: string, goalId: string): Promise<Blocker[]> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-blockers', 'getBlockersForGoal');
    return [];
  }

  try {
    const blockersRef = db.collection(getBlockersPath(userId));
    const query = blockersRef
      .where('linkedGoalId', '==', goalId)
      .orderBy('createdAt', 'desc')
      .limit(50);

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => firestoreToBlocker(doc.data() as FirestoreBlocker));
  } catch (error) {
    log.error({ error: String(error), userId, goalId }, 'Failed to get blockers for goal');
    return [];
  }
}

/**
 * Get count of active blockers.
 */
export async function getActiveBlockerCount(userId: string): Promise<number> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-blockers', 'getActiveBlockerCount');
    return 0;
  }

  try {
    const blockersRef = db.collection(getBlockersPath(userId));
    const snapshot = await blockersRef.where('status', '==', 'active').count().get();
    return snapshot.data().count;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get active blocker count');
    return 0;
  }
}

/**
 * Get blockers by severity.
 */
export async function getBlockersBySeverity(
  userId: string,
  severity: BlockerSeverity
): Promise<Blocker[]> {
  validateSeverity(severity);

  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-blockers', 'getBlockersBySeverity');
    return [];
  }

  try {
    const blockersRef = db.collection(getBlockersPath(userId));
    const query = blockersRef
      .where('severity', '==', severity)
      .where('status', '==', 'active')
      .orderBy('createdAt', 'desc')
      .limit(50);

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => firestoreToBlocker(doc.data() as FirestoreBlocker));
  } catch (error) {
    log.error({ error: String(error), userId, severity }, 'Failed to get blockers by severity');
    return [];
  }
}

// ============================================================================
// SERVICE INTERFACE
// ============================================================================

export interface BlockersService {
  addBlocker: (
    userId: string,
    description: string,
    linkedGoalId?: string,
    severity?: BlockerSeverity
  ) => Promise<Blocker>;
  getBlockers: (userId: string, status?: BlockerStatus) => Promise<Blocker[]>;
  getActiveBlockers: (userId: string) => Promise<Blocker[]>;
  getBlocker: (userId: string, blockerId: string) => Promise<Blocker | null>;
  resolveBlocker: (userId: string, blockerId: string, resolution?: string) => Promise<Blocker>;
  escalateBlocker: (userId: string, blockerId: string, escalatedTo?: string) => Promise<Blocker>;
  getBlockersForGoal: (userId: string, goalId: string) => Promise<Blocker[]>;
  getActiveBlockerCount: (userId: string) => Promise<number>;
  getBlockersBySeverity: (userId: string, severity: BlockerSeverity) => Promise<Blocker[]>;
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Singleton blockers service instance.
 * Use this for typed access to all blockers operations.
 */
export const blockersService: BlockersService = {
  addBlocker,
  getBlockers,
  getActiveBlockers,
  getBlocker,
  resolveBlocker,
  escalateBlocker,
  getBlockersForGoal,
  getActiveBlockerCount,
  getBlockersBySeverity,
};

export default blockersService;
