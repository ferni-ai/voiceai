/**
 * Priorities Service
 *
 * Manage user priorities with ordering, urgency levels, and completion tracking.
 * Stored in Firestore under users/{userId}/priorities/{priorityId}
 *
 * @module services/ceo/priorities
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

const log = createLogger({ module: 'ceo-priorities' });

// ============================================================================
// TYPES
// ============================================================================

export interface Priority {
  id: string;
  userId: string;
  title: string;
  order: number;
  urgency: number; // 1-5 scale
  completed: boolean;
  completedAt?: Date;
  createdAt: Date;
}

interface FirestorePriority {
  id: string;
  userId: string;
  title: string;
  order: number;
  urgency: number;
  completed: boolean;
  completedAt?: Timestamp;
  createdAt: Timestamp;
}

// ============================================================================
// COLLECTION PATHS
// ============================================================================

const PRIORITIES_COLLECTION = 'priorities';

function getPrioritiesPath(userId: string): string {
  return `users/${userId}/${PRIORITIES_COLLECTION}`;
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateUrgency(urgency: number): void {
  if (urgency < 1 || urgency > 5) {
    throw new Error('Urgency must be between 1 and 5');
  }
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Add a new priority.
 * New priorities are added at the end of the list by default.
 */
export async function addPriority(userId: string, title: string, urgency = 3): Promise<Priority> {
  validateUrgency(urgency);

  const db = getFirestoreDb();

  // Get the next order number
  let nextOrder = 0;
  if (db) {
    try {
      const snapshot = await db
        .collection(getPrioritiesPath(userId))
        .where('completed', '==', false)
        .orderBy('order', 'desc')
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const lastPriority = snapshot.docs[0].data() as FirestorePriority;
        nextOrder = lastPriority.order + 1;
      }
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to get next order, using 0');
    }
  }

  const priority: Priority = {
    id: generateId('pri'),
    userId,
    title,
    order: nextOrder,
    urgency,
    completed: false,
    createdAt: new Date(),
  };

  if (!db) {
    recordDegradation('ceo-priorities', 'addPriority');
    log.warn({ userId }, 'Firestore unavailable, priority not persisted');
    return priority;
  }

  try {
    const firestorePriority: FirestorePriority = {
      id: priority.id,
      userId: priority.userId,
      title: priority.title,
      order: priority.order,
      urgency: priority.urgency,
      completed: priority.completed,
      createdAt: Timestamp.fromDate(priority.createdAt),
    };

    const docRef = db.collection(getPrioritiesPath(userId)).doc(priority.id);
    await docRef.set(cleanForFirestore(firestorePriority));

    log.info({ userId, priorityId: priority.id, title }, 'Priority added');
    return priority;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to add priority');
    return priority;
  }
}

/**
 * Get all priorities for a user.
 * Sorted by order (ascending), completed items at the end.
 */
export async function getPriorities(userId: string, includeCompleted = false): Promise<Priority[]> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-priorities', 'getPriorities');
    return [];
  }

  try {
    const prioritiesRef = db.collection(getPrioritiesPath(userId));
    let query = prioritiesRef.orderBy('order', 'asc');

    if (!includeCompleted) {
      query = prioritiesRef.where('completed', '==', false).orderBy('order', 'asc');
    }

    const snapshot = await query.limit(100).get();

    const priorities = snapshot.docs.map((doc) =>
      firestoreToPriority(doc.data() as FirestorePriority)
    );

    // If including completed, sort so incomplete come first
    if (includeCompleted) {
      priorities.sort((a, b) => {
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }
        return a.order - b.order;
      });
    }

    return priorities;
  } catch (error) {
    log.error({ error: String(error), userId, includeCompleted }, 'Failed to get priorities');
    return [];
  }
}

/**
 * Mark a priority as completed.
 */
export async function completePriority(userId: string, priorityId: string): Promise<Priority> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-priorities', 'completePriority');
    throw new Error('Database not available');
  }

  try {
    const docRef = db.collection(getPrioritiesPath(userId)).doc(priorityId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error('Priority not found');
    }

    const existing = firestoreToPriority(doc.data() as FirestorePriority);
    const now = new Date();

    const updated: Priority = {
      ...existing,
      completed: true,
      completedAt: now,
    };

    const firestoreUpdate: FirestorePriority = {
      ...existing,
      completed: true,
      completedAt: Timestamp.fromDate(now),
      createdAt: Timestamp.fromDate(existing.createdAt),
    };

    await docRef.set(cleanForFirestore(firestoreUpdate));

    log.info({ userId, priorityId }, 'Priority completed');
    return updated;
  } catch (error) {
    const errorMsg = String(error);
    if (errorMsg.includes('Priority not found')) {
      throw error;
    }
    log.error({ error: errorMsg, userId, priorityId }, 'Failed to complete priority');
    throw new Error('Failed to complete priority');
  }
}

/**
 * Reorder priorities by providing an array of IDs in the desired order.
 * Only updates the order field for the specified priorities.
 */
export async function reorderPriorities(userId: string, orderedIds: string[]): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-priorities', 'reorderPriorities');
    throw new Error('Database not available');
  }

  try {
    const batch = db.batch();
    const prioritiesRef = db.collection(getPrioritiesPath(userId));

    orderedIds.forEach((id, index) => {
      const docRef = prioritiesRef.doc(id);
      batch.update(docRef, { order: index });
    });

    await batch.commit();

    log.info({ userId, count: orderedIds.length }, 'Priorities reordered');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to reorder priorities');
    throw new Error('Failed to reorder priorities');
  }
}

/**
 * Remove all completed priorities.
 */
export async function clearCompleted(userId: string): Promise<number> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-priorities', 'clearCompleted');
    throw new Error('Database not available');
  }

  try {
    const prioritiesRef = db.collection(getPrioritiesPath(userId));
    const snapshot = await prioritiesRef.where('completed', '==', true).get();

    if (snapshot.empty) {
      return 0;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    const count = snapshot.docs.length;
    log.info({ userId, count }, 'Completed priorities cleared');
    return count;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to clear completed priorities');
    throw new Error('Failed to clear completed priorities');
  }
}

/**
 * Get the top (highest priority) item.
 * Returns the first incomplete priority by order.
 */
export async function getTopPriority(userId: string): Promise<Priority | null> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-priorities', 'getTopPriority');
    return null;
  }

  try {
    const prioritiesRef = db.collection(getPrioritiesPath(userId));
    const snapshot = await prioritiesRef
      .where('completed', '==', false)
      .orderBy('order', 'asc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return firestoreToPriority(snapshot.docs[0].data() as FirestorePriority);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get top priority');
    return null;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function firestoreToPriority(data: FirestorePriority): Priority {
  return {
    id: data.id,
    userId: data.userId,
    title: data.title,
    order: data.order,
    urgency: data.urgency,
    completed: data.completed,
    completedAt: data.completedAt ? toSafeDate(data.completedAt) : undefined,
    createdAt: toSafeDate(data.createdAt),
  };
}

// ============================================================================
// SERVICE INTERFACE
// ============================================================================

export interface PrioritiesService {
  addPriority: (userId: string, title: string, urgency?: number) => Promise<Priority>;
  getPriorities: (userId: string, includeCompleted?: boolean) => Promise<Priority[]>;
  completePriority: (userId: string, priorityId: string) => Promise<Priority>;
  reorderPriorities: (userId: string, orderedIds: string[]) => Promise<void>;
  clearCompleted: (userId: string) => Promise<number>;
  getTopPriority: (userId: string) => Promise<Priority | null>;
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Singleton priorities service instance.
 * Use this for typed access to all priorities operations.
 */
export const prioritiesService: PrioritiesService = {
  addPriority,
  getPriorities,
  completePriority,
  reorderPriorities,
  clearCompleted,
  getTopPriority,
};

export default prioritiesService;
