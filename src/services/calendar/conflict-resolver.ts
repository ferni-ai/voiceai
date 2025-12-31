/**
 * Calendar Conflict Resolver
 *
 * Manages sync conflicts between Ferni calendar and external providers.
 * Supports automatic and manual resolution strategies.
 *
 * Conflict Types:
 * - time: Start/end time differs
 * - title: Event name differs
 * - location: Location differs
 * - deleted: Event deleted in one place but exists in other
 * - both-modified: Both sides modified since last sync
 *
 * @module calendar/conflict-resolver
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import type { CalendarEvent, SyncConflict, ConflictResolution, CalendarProvider } from './types.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { onCalendarConflictChange } from '../data-layer/hooks/calendar-hooks.js';

const log = getLogger();

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

let db: FirestoreType | null = null;
// FIX: Promise-based singleton to prevent race condition
let dbInitPromise: Promise<FirestoreType | null> | null = null;

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = initializeFirestore();
  return dbInitPromise;
}

async function initializeFirestore(): Promise<FirestoreType | null> {
  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    return db;
  } catch (error) {
    log.warn({ error }, 'Firestore not available for conflict resolver');
    dbInitPromise = null; // Allow retry
    return null;
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface StoredConflict {
  id: string;
  userId: string;
  eventId: string;
  provider: CalendarProvider;
  conflictType: SyncConflict['conflictType'];
  ferniEvent: Partial<CalendarEvent>;
  providerEvent: Partial<CalendarEvent>;
  detectedAt: string;
  resolvedAt?: string;
  resolution?: ConflictResolution;
  resolvedBy?: 'auto' | 'user';
}

export interface ConflictSummary {
  total: number;
  byType: Record<string, number>;
  byProvider: Record<string, number>;
  pending: number;
  resolved: number;
}

// ============================================================================
// CONFLICT DETECTION
// ============================================================================

/**
 * Compare two events and detect conflicts
 */
export function detectConflicts(
  ferniEvent: CalendarEvent,
  providerEvent: Partial<CalendarEvent>
): SyncConflict['conflictType'] | null {
  // Check for deletion
  if (!ferniEvent || !providerEvent) {
    return 'deleted';
  }

  // Check for both-modified (need timestamps)
  const ferniUpdated = ferniEvent.updatedAt?.getTime() || 0;
  const providerUpdated = providerEvent.updatedAt ? new Date(providerEvent.updatedAt).getTime() : 0;
  const lastSync = ferniEvent.lastSyncAttempt?.getTime() || 0;

  if (ferniUpdated > lastSync && providerUpdated > lastSync) {
    return 'both-modified';
  }

  // Check for specific field conflicts
  if (
    ferniEvent.startTime?.getTime() !== new Date(providerEvent.startTime!).getTime() ||
    ferniEvent.endTime?.getTime() !== new Date(providerEvent.endTime!).getTime()
  ) {
    return 'time';
  }

  if (ferniEvent.title !== providerEvent.title) {
    return 'title';
  }

  if (ferniEvent.location !== providerEvent.location) {
    return 'location';
  }

  return null;
}

// ============================================================================
// CONFLICT STORAGE
// ============================================================================

/**
 * Store a conflict for later resolution
 */
export async function storeConflict(
  userId: string,
  conflict: SyncConflict,
  provider: CalendarProvider
): Promise<string | null> {
  const firestore = await getFirestore();
  if (!firestore) return null;

  try {
    const conflictId = `${conflict.eventId}_${provider}_${Date.now()}`;

    const storedConflict: StoredConflict = {
      id: conflictId,
      userId,
      eventId: conflict.eventId,
      provider,
      conflictType: conflict.conflictType,
      ferniEvent: {
        id: conflict.ferniEvent.id,
        title: conflict.ferniEvent.title,
        startTime: conflict.ferniEvent.startTime,
        endTime: conflict.ferniEvent.endTime,
        location: conflict.ferniEvent.location,
        updatedAt: conflict.ferniEvent.updatedAt,
      },
      providerEvent: conflict.providerEvent,
      detectedAt: conflict.detectedAt.toISOString(),
    };

    await firestore
      .collection(`users/${userId}/calendar_conflicts`)
      .doc(conflictId)
      .set(cleanForFirestore(storedConflict));

    // Index to semantic memory for conflict awareness
    void onCalendarConflictChange(
      userId,
      conflictId,
      {
        events: [conflict.ferniEvent.title || 'Unknown', conflict.providerEvent.title || 'Unknown'],
        date: conflict.detectedAt.toISOString(),
        status: 'unresolved',
      },
      'create'
    );

    log.info(
      { userId, conflictId, conflictType: conflict.conflictType },
      'Stored calendar conflict'
    );
    return conflictId;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error storing conflict');
    return null;
  }
}

/**
 * Get all pending conflicts for a user
 */
export async function getPendingConflicts(userId: string): Promise<StoredConflict[]> {
  const firestore = await getFirestore();
  if (!firestore) return [];

  try {
    const snapshot = await firestore
      .collection(`users/${userId}/calendar_conflicts`)
      .where('resolvedAt', '==', null)
      .orderBy('detectedAt', 'desc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc) => doc.data() as StoredConflict);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error getting pending conflicts');
    return [];
  }
}

/**
 * Get conflict summary for a user
 */
export async function getConflictSummary(userId: string): Promise<ConflictSummary> {
  const firestore = await getFirestore();
  if (!firestore) {
    return {
      total: 0,
      byType: {},
      byProvider: {},
      pending: 0,
      resolved: 0,
    };
  }

  try {
    const snapshot = await firestore.collection(`users/${userId}/calendar_conflicts`).get();

    const conflicts = snapshot.docs.map((doc) => doc.data() as StoredConflict);

    const byType: Record<string, number> = {};
    const byProvider: Record<string, number> = {};
    let pending = 0;
    let resolved = 0;

    for (const conflict of conflicts) {
      byType[conflict.conflictType] = (byType[conflict.conflictType] || 0) + 1;
      byProvider[conflict.provider] = (byProvider[conflict.provider] || 0) + 1;

      if (conflict.resolvedAt) {
        resolved++;
      } else {
        pending++;
      }
    }

    return {
      total: conflicts.length,
      byType,
      byProvider,
      pending,
      resolved,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error getting conflict summary');
    return {
      total: 0,
      byType: {},
      byProvider: {},
      pending: 0,
      resolved: 0,
    };
  }
}

// ============================================================================
// CONFLICT RESOLUTION
// ============================================================================

/**
 * Resolve a conflict with the given strategy
 */
export async function resolveConflict(
  userId: string,
  conflictId: string,
  resolution: ConflictResolution,
  resolvedBy: 'auto' | 'user' = 'user'
): Promise<{ success: boolean; event?: CalendarEvent }> {
  const firestore = await getFirestore();
  if (!firestore) {
    return { success: false };
  }

  try {
    const conflictRef = firestore.collection(`users/${userId}/calendar_conflicts`).doc(conflictId);

    const conflictDoc = await conflictRef.get();
    if (!conflictDoc.exists) {
      log.warn({ userId, conflictId }, 'Conflict not found');
      return { success: false };
    }

    const conflict = conflictDoc.data() as StoredConflict;

    // Determine which version to use
    let resolvedEvent: Partial<CalendarEvent>;

    switch (resolution) {
      case 'ferni-wins':
        resolvedEvent = conflict.ferniEvent;
        break;
      case 'provider-wins':
        resolvedEvent = conflict.providerEvent;
        break;
      case 'newest-wins':
        const ferniUpdated = conflict.ferniEvent.updatedAt
          ? new Date(conflict.ferniEvent.updatedAt as unknown as string).getTime()
          : 0;
        const providerUpdated = conflict.providerEvent.updatedAt
          ? new Date(conflict.providerEvent.updatedAt as unknown as string).getTime()
          : 0;
        resolvedEvent =
          ferniUpdated > providerUpdated ? conflict.ferniEvent : conflict.providerEvent;
        break;
      case 'manual':
        // For manual, we just mark as resolved - caller handles the merge
        resolvedEvent = conflict.ferniEvent;
        break;
      default:
        resolvedEvent = conflict.ferniEvent;
    }

    // Mark conflict as resolved
    await conflictRef.update(
      cleanForFirestore({
        resolvedAt: new Date().toISOString(),
        resolution,
        resolvedBy,
      })
    );

    // Update semantic index with resolved status
    void onCalendarConflictChange(
      userId,
      conflictId,
      {
        events: [conflict.ferniEvent.title || 'Unknown', conflict.providerEvent.title || 'Unknown'],
        date: conflict.detectedAt,
        resolution,
        status: 'resolved',
      },
      'update'
    );

    log.info({ userId, conflictId, resolution, resolvedBy }, 'Resolved calendar conflict');

    return {
      success: true,
      event: resolvedEvent as CalendarEvent,
    };
  } catch (error) {
    log.error({ error: String(error), userId, conflictId }, 'Error resolving conflict');
    return { success: false };
  }
}

/**
 * Auto-resolve conflicts using user's preferred strategy
 */
export async function autoResolveConflicts(
  userId: string,
  strategy: ConflictResolution = 'newest-wins'
): Promise<{ resolved: number; failed: number }> {
  const pending = await getPendingConflicts(userId);
  let resolved = 0;
  let failed = 0;

  for (const conflict of pending) {
    const result = await resolveConflict(userId, conflict.id, strategy, 'auto');
    if (result.success) {
      resolved++;
    } else {
      failed++;
    }
  }

  log.info({ userId, resolved, failed, strategy }, 'Auto-resolved conflicts');
  return { resolved, failed };
}

/**
 * Delete a conflict without resolving
 */
export async function dismissConflict(userId: string, conflictId: string): Promise<boolean> {
  const firestore = await getFirestore();
  if (!firestore) return false;

  try {
    await firestore.collection(`users/${userId}/calendar_conflicts`).doc(conflictId).delete();

    log.info({ userId, conflictId }, 'Dismissed calendar conflict');
    return true;
  } catch (error) {
    log.error({ error: String(error), userId, conflictId }, 'Error dismissing conflict');
    return false;
  }
}

/**
 * Get user's preferred conflict resolution strategy
 */
export async function getResolutionPreference(userId: string): Promise<ConflictResolution> {
  const firestore = await getFirestore();
  if (!firestore) return 'newest-wins';

  try {
    const doc = await firestore.collection('users').doc(userId).get();
    const data = doc.data();
    return (data?.calendarConflictResolution as ConflictResolution) || 'newest-wins';
  } catch {
    return 'newest-wins';
  }
}

/**
 * Set user's preferred conflict resolution strategy
 */
export async function setResolutionPreference(
  userId: string,
  strategy: ConflictResolution
): Promise<boolean> {
  const firestore = await getFirestore();
  if (!firestore) return false;

  try {
    await firestore
      .collection('users')
      .doc(userId)
      .set(cleanForFirestore({ calendarConflictResolution: strategy }), { merge: true });
    log.info({ userId, strategy }, 'Updated conflict resolution preference');
    return true;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error setting resolution preference');
    return false;
  }
}

export default {
  detectConflicts,
  storeConflict,
  getPendingConflicts,
  getConflictSummary,
  resolveConflict,
  autoResolveConflicts,
  dismissConflict,
  getResolutionPreference,
  setResolutionPreference,
};
