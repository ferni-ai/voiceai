/**
 * Decisions Service - Decision Tracking
 *
 * Track decisions with context, options, outcomes, and ratings.
 * Stored in Firestore under users/{userId}/decisions/{decisionId}
 *
 * @module services/ceo/decisions
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

const log = createLogger({ module: 'ceo-decisions' });

// ============================================================================
// TYPES
// ============================================================================

export type DecisionStatus = 'pending' | 'made' | 'reviewed';

export interface Decision {
  id: string;
  userId: string;
  title: string;
  context?: string;
  options?: string[];
  status: DecisionStatus;
  choice?: string;
  reasoning?: string;
  outcome?: string;
  outcomeRating?: number; // 1-5
  madeAt?: Date;
  reviewedAt?: Date;
  createdAt: Date;
}

interface FirestoreDecision {
  id: string;
  userId: string;
  title: string;
  context?: string;
  options?: string[];
  status: DecisionStatus;
  choice?: string;
  reasoning?: string;
  outcome?: string;
  outcomeRating?: number;
  madeAt?: Timestamp;
  reviewedAt?: Timestamp;
  createdAt: Timestamp;
}

// ============================================================================
// VALIDATION
// ============================================================================

const VALID_STATUSES: DecisionStatus[] = ['pending', 'made', 'reviewed'];

function validateStatus(status: string): asserts status is DecisionStatus {
  if (!VALID_STATUSES.includes(status as DecisionStatus)) {
    throw new Error(`Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }
}

function validateRating(rating: number): void {
  if (rating < 1 || rating > 5) {
    throw new Error('Outcome rating must be between 1 and 5');
  }
}

// ============================================================================
// COLLECTION PATHS
// ============================================================================

const DECISIONS_COLLECTION = 'decisions';

function getDecisionsPath(userId: string): string {
  return `users/${userId}/${DECISIONS_COLLECTION}`;
}

// ============================================================================
// HELPERS
// ============================================================================

function firestoreToDecision(data: FirestoreDecision): Decision {
  return {
    id: data.id,
    userId: data.userId,
    title: data.title,
    context: data.context,
    options: data.options,
    status: data.status,
    choice: data.choice,
    reasoning: data.reasoning,
    outcome: data.outcome,
    outcomeRating: data.outcomeRating,
    madeAt: data.madeAt ? toSafeDate(data.madeAt) : undefined,
    reviewedAt: data.reviewedAt ? toSafeDate(data.reviewedAt) : undefined,
    createdAt: toSafeDate(data.createdAt),
  };
}

function decisionToFirestore(decision: Decision): FirestoreDecision {
  return {
    id: decision.id,
    userId: decision.userId,
    title: decision.title,
    context: decision.context,
    options: decision.options,
    status: decision.status,
    choice: decision.choice,
    reasoning: decision.reasoning,
    outcome: decision.outcome,
    outcomeRating: decision.outcomeRating,
    madeAt: decision.madeAt ? Timestamp.fromDate(decision.madeAt) : undefined,
    reviewedAt: decision.reviewedAt ? Timestamp.fromDate(decision.reviewedAt) : undefined,
    createdAt: Timestamp.fromDate(decision.createdAt),
  };
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Add a new decision to track.
 */
export async function addDecision(
  userId: string,
  title: string,
  context?: string,
  options?: string[]
): Promise<Decision> {
  const db = getFirestoreDb();

  const decision: Decision = {
    id: generateId('dec'),
    userId,
    title,
    context,
    options,
    status: 'pending',
    createdAt: new Date(),
  };

  if (!db) {
    recordDegradation('ceo-decisions', 'addDecision');
    log.warn({ userId }, 'Firestore unavailable, decision not persisted');
    return decision;
  }

  try {
    const firestoreDecision = decisionToFirestore(decision);
    const docRef = db.collection(getDecisionsPath(userId)).doc(decision.id);
    await docRef.set(cleanForFirestore(firestoreDecision));

    log.info({ userId, decisionId: decision.id, title }, 'Decision added');
    return decision;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to add decision');
    return decision;
  }
}

/**
 * Get decisions for a user, optionally filtered by status.
 */
export async function getDecisions(userId: string, status?: DecisionStatus): Promise<Decision[]> {
  if (status) {
    validateStatus(status);
  }

  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-decisions', 'getDecisions');
    return [];
  }

  try {
    const decisionsRef = db.collection(getDecisionsPath(userId));
    const queryRef = status
      ? decisionsRef.where('status', '==', status).orderBy('createdAt', 'desc')
      : decisionsRef.orderBy('createdAt', 'desc');

    const snapshot = await queryRef.limit(100).get();

    return snapshot.docs.map((doc) => firestoreToDecision(doc.data() as FirestoreDecision));
  } catch (error) {
    log.error({ error: String(error), userId, status }, 'Failed to get decisions');
    return [];
  }
}

/**
 * Get a single decision by ID.
 */
export async function getDecision(userId: string, decisionId: string): Promise<Decision | null> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-decisions', 'getDecision');
    return null;
  }

  try {
    const docRef = db.collection(getDecisionsPath(userId)).doc(decisionId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return null;
    }

    return firestoreToDecision(doc.data() as FirestoreDecision);
  } catch (error) {
    log.error({ error: String(error), userId, decisionId }, 'Failed to get decision');
    return null;
  }
}

/**
 * Record the decision that was made.
 */
export async function makeDecision(
  userId: string,
  decisionId: string,
  choice: string,
  reasoning?: string
): Promise<Decision> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-decisions', 'makeDecision');
    throw new Error('Database not available');
  }

  try {
    const docRef = db.collection(getDecisionsPath(userId)).doc(decisionId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error('Decision not found');
    }

    const existing = firestoreToDecision(doc.data() as FirestoreDecision);

    const updated: Decision = {
      ...existing,
      status: 'made',
      choice,
      reasoning,
      madeAt: new Date(),
    };

    await docRef.set(cleanForFirestore(decisionToFirestore(updated)), { merge: true });

    log.info({ userId, decisionId, choice }, 'Decision made');
    return updated;
  } catch (error) {
    const errorMsg = String(error);
    if (errorMsg.includes('Decision not found')) {
      throw error;
    }
    log.error({ error: errorMsg, userId, decisionId }, 'Failed to make decision');
    throw new Error('Failed to make decision');
  }
}

/**
 * Add an outcome to a decision after the fact.
 */
export async function addOutcome(
  userId: string,
  decisionId: string,
  outcome: string,
  rating?: number
): Promise<Decision> {
  if (rating !== undefined) {
    validateRating(rating);
  }

  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-decisions', 'addOutcome');
    throw new Error('Database not available');
  }

  try {
    const docRef = db.collection(getDecisionsPath(userId)).doc(decisionId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error('Decision not found');
    }

    const existing = firestoreToDecision(doc.data() as FirestoreDecision);

    const updated: Decision = {
      ...existing,
      status: 'reviewed',
      outcome,
      outcomeRating: rating,
      reviewedAt: new Date(),
    };

    await docRef.set(cleanForFirestore(decisionToFirestore(updated)), { merge: true });

    log.info({ userId, decisionId, rating }, 'Outcome added to decision');
    return updated;
  } catch (error) {
    const errorMsg = String(error);
    if (errorMsg.includes('Decision not found')) {
      throw error;
    }
    log.error({ error: errorMsg, userId, decisionId }, 'Failed to add outcome');
    throw new Error('Failed to add outcome');
  }
}

/**
 * Get all pending decisions for a user.
 */
export async function getPendingDecisions(userId: string): Promise<Decision[]> {
  return getDecisions(userId, 'pending');
}

// ============================================================================
// SERVICE INTERFACE
// ============================================================================

export interface DecisionsService {
  addDecision: (
    userId: string,
    title: string,
    context?: string,
    options?: string[]
  ) => Promise<Decision>;
  getDecisions: (userId: string, status?: DecisionStatus) => Promise<Decision[]>;
  getDecision: (userId: string, decisionId: string) => Promise<Decision | null>;
  makeDecision: (
    userId: string,
    decisionId: string,
    choice: string,
    reasoning?: string
  ) => Promise<Decision>;
  addOutcome: (
    userId: string,
    decisionId: string,
    outcome: string,
    rating?: number
  ) => Promise<Decision>;
  getPendingDecisions: (userId: string) => Promise<Decision[]>;
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Singleton decisions service instance.
 * Use this for typed access to all decision operations.
 */
export const decisionsService: DecisionsService = {
  addDecision,
  getDecisions,
  getDecision,
  makeDecision,
  addOutcome,
  getPendingDecisions,
};

export default decisionsService;
