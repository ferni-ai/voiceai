/**
 * Wellbeing Persistence Layer
 *
 * Persists wellbeing snapshots and profiles to Firestore for cross-session
 * data retention. In-memory caching provides fast reads.
 *
 * Storage structure:
 * - bogle_users/{userId}/wellbeing_profile (single document)
 * - bogle_users/{userId}/wellbeing_snapshots/{snapshotId} (collection)
 *
 * @module WellbeingPersistence
 */

import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { getLogger } from '../../utils/safe-logger.js';
import { onWellnessCheckinChange } from '../data-layer/hooks/index.js';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase-admin/firestore';
import type {
  WellbeingSnapshot,
  WellbeingProfile,
  WellbeingBaseline,
  WellbeingTrend,
  WellbeingDimensions,
} from './index.js';

const log = getLogger().child({ module: 'wellbeing-persistence' });

// ============================================================================
// TYPES
// ============================================================================

interface FirestoreSnapshot {
  id: string;
  userId: string;
  timestamp: string; // ISO string
  source: WellbeingSnapshot['source'];
  dimensions: Partial<WellbeingDimensions>;
  confidence: Partial<Record<keyof WellbeingDimensions, number>>;
  conversationId?: string;
  topic?: string;
  notes?: string;
}

interface FirestoreProfile {
  userId: string;
  currentSnapshotId: string | null;
  personalBaseline: WellbeingBaseline | null;
  weeklyTrends: WellbeingTrend[];
  monthlyTrends: WellbeingTrend[];
  totalSnapshots: number;
  firstSnapshot: string | null; // ISO string
  lastSnapshot: string | null; // ISO string
  updatedAt: string;
}

// ============================================================================
// CACHE
// ============================================================================

const profileCache = new Map<string, { profile: WellbeingProfile; expiresAt: number }>();
const snapshotCache = new Map<string, { snapshots: WellbeingSnapshot[]; expiresAt: number }>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function clearCacheForUser(userId: string): void {
  profileCache.delete(userId);
  snapshotCache.delete(userId);
}

// ============================================================================
// SNAPSHOT PERSISTENCE
// ============================================================================

/**
 * Save a wellbeing snapshot to Firestore.
 */
export async function persistSnapshot(
  userId: string,
  snapshot: WellbeingSnapshot
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'Firestore not available, skipping snapshot persistence');
    return false;
  }

  try {
    const firestoreData: FirestoreSnapshot = {
      id: snapshot.id,
      userId: snapshot.userId,
      timestamp: snapshot.timestamp.toISOString(),
      source: snapshot.source,
      dimensions: snapshot.dimensions,
      confidence: snapshot.confidence,
      conversationId: snapshot.conversationId,
      topic: snapshot.topic,
      notes: snapshot.notes,
    };

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('wellbeing_snapshots')
      .doc(snapshot.id)
      .set(cleanForFirestore(firestoreData));

    // Clear cache to force refresh
    clearCacheForUser(userId);

    log.debug({ userId, snapshotId: snapshot.id }, 'Wellbeing snapshot persisted');

    // Index to semantic memory
    void onWellnessCheckinChange(userId, snapshot.id, {
      mood: (snapshot.dimensions.mood ?? 0) * 10, // Convert -1 to 1 to 0-10 scale
      energy: (snapshot.dimensions.energy ?? 0) * 10, // Convert 0-1 to 0-10 scale
      stressLevel: snapshot.dimensions.worry !== undefined ? snapshot.dimensions.worry * 10 : undefined,
      notes: snapshot.notes,
      timestamp: snapshot.timestamp.toISOString(),
    }, 'update');

    return true;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to persist wellbeing snapshot');
    return false;
  }
}

/**
 * Load recent snapshots from Firestore.
 */
export async function loadSnapshots(userId: string, days = 30): Promise<WellbeingSnapshot[]> {
  // Check cache first
  const cached = snapshotCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.snapshots.filter(
      (s) => s.timestamp >= new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    );
  }

  const db = getFirestoreDb();
  if (!db) {
    return [];
  }

  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const querySnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('wellbeing_snapshots')
      .where('timestamp', '>=', cutoff.toISOString())
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();

    const snapshots: WellbeingSnapshot[] = querySnapshot.docs.map(
      (doc: QueryDocumentSnapshot<DocumentData>) => {
        const data = doc.data() as FirestoreSnapshot;
        return {
          id: data.id,
          userId: data.userId,
          timestamp: new Date(data.timestamp),
          source: data.source,
          dimensions: data.dimensions,
          confidence: data.confidence,
          conversationId: data.conversationId,
          topic: data.topic,
          notes: data.notes,
        };
      }
    );

    // Update cache
    snapshotCache.set(cleanForFirestore(userId), {
      snapshots,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    log.debug({ userId, count: snapshots.length }, 'Loaded wellbeing snapshots from Firestore');
    return snapshots;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load wellbeing snapshots');
    return [];
  }
}

// ============================================================================
// PROFILE PERSISTENCE
// ============================================================================

/**
 * Save a wellbeing profile to Firestore.
 */
export async function persistProfile(userId: string, profile: WellbeingProfile): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'Firestore not available, skipping profile persistence');
    return false;
  }

  try {
    const firestoreData: FirestoreProfile = {
      userId: profile.userId,
      currentSnapshotId: profile.current?.id || null,
      personalBaseline: profile.personalBaseline
        ? {
            ...profile.personalBaseline,
            lastUpdated: new Date(profile.personalBaseline.lastUpdated),
          }
        : null,
      weeklyTrends: profile.weeklyTrends,
      monthlyTrends: profile.monthlyTrends,
      totalSnapshots: profile.totalSnapshots,
      firstSnapshot: profile.firstSnapshot?.toISOString() || null,
      lastSnapshot: profile.lastSnapshot?.toISOString() || null,
      updatedAt: new Date().toISOString(),
    };

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('wellbeing_profile')
      .doc('current')
      .set(cleanForFirestore(firestoreData), { merge: true });

    // Update cache
    profileCache.set(cleanForFirestore(userId), {
      profile,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    log.debug({ userId }, 'Wellbeing profile persisted');
    return true;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to persist wellbeing profile');
    return false;
  }
}

/**
 * Load a wellbeing profile from Firestore.
 */
export async function loadProfile(userId: string): Promise<WellbeingProfile | null> {
  // Check cache first
  const cached = profileCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.profile;
  }

  const db = getFirestoreDb();
  if (!db) {
    return null;
  }

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('wellbeing_profile')
      .doc('current')
      .get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data() as FirestoreProfile;

    // Load the current snapshot if we have one
    let currentSnapshot: WellbeingSnapshot | null = null;
    if (data.currentSnapshotId) {
      const snapshotDoc = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('wellbeing_snapshots')
        .doc(data.currentSnapshotId)
        .get();

      if (snapshotDoc.exists) {
        const snapshotData = snapshotDoc.data() as FirestoreSnapshot;
        currentSnapshot = {
          id: snapshotData.id,
          userId: snapshotData.userId,
          timestamp: new Date(snapshotData.timestamp),
          source: snapshotData.source,
          dimensions: snapshotData.dimensions,
          confidence: snapshotData.confidence,
          conversationId: snapshotData.conversationId,
          topic: snapshotData.topic,
          notes: snapshotData.notes,
        };
      }
    }

    const profile: WellbeingProfile = {
      userId: data.userId,
      current: currentSnapshot,
      personalBaseline: data.personalBaseline
        ? {
            ...data.personalBaseline,
            lastUpdated: new Date(data.personalBaseline.lastUpdated),
          }
        : null,
      weeklyTrends: data.weeklyTrends || [],
      monthlyTrends: data.monthlyTrends || [],
      totalSnapshots: data.totalSnapshots,
      firstSnapshot: data.firstSnapshot ? new Date(data.firstSnapshot) : null,
      lastSnapshot: data.lastSnapshot ? new Date(data.lastSnapshot) : null,
    };

    // Update cache
    profileCache.set(cleanForFirestore(userId), {
      profile,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    log.debug({ userId }, 'Loaded wellbeing profile from Firestore');
    return profile;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load wellbeing profile');
    return null;
  }
}

// ============================================================================
// DATA EXPORT (for GDPR)
// ============================================================================

/**
 * Export all wellbeing data for a user (GDPR compliance).
 */
export async function exportWellbeingData(userId: string): Promise<{
  profile: WellbeingProfile | null;
  snapshots: WellbeingSnapshot[];
} | null> {
  const db = getFirestoreDb();
  if (!db) {
    return null;
  }

  try {
    // Load profile
    const profile = await loadProfile(userId);

    // Load ALL snapshots (not just recent)
    const querySnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('wellbeing_snapshots')
      .orderBy('timestamp', 'desc')
      .get();

    const snapshots: WellbeingSnapshot[] = querySnapshot.docs.map(
      (doc: QueryDocumentSnapshot<DocumentData>) => {
        const data = doc.data() as FirestoreSnapshot;
        return {
          id: data.id,
          userId: data.userId,
          timestamp: new Date(data.timestamp),
          source: data.source,
          dimensions: data.dimensions,
          confidence: data.confidence,
          conversationId: data.conversationId,
          topic: data.topic,
          notes: data.notes,
        };
      }
    );

    log.info({ userId, snapshotCount: snapshots.length }, 'Exported wellbeing data');

    return { profile, snapshots };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to export wellbeing data');
    return null;
  }
}

/**
 * Delete all wellbeing data for a user (GDPR compliance).
 */
export async function deleteWellbeingData(userId: string): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) {
    return false;
  }

  try {
    // Delete all snapshots
    const snapshotsRef = db.collection('bogle_users').doc(userId).collection('wellbeing_snapshots');

    const snapshotDocs = await snapshotsRef.listDocuments();
    const deletePromises = snapshotDocs.map((doc) => doc.delete());
    await Promise.all(deletePromises);

    // Delete profile
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('wellbeing_profile')
      .doc('current')
      .delete();

    // Clear cache
    clearCacheForUser(userId);

    log.info({ userId, deletedSnapshots: snapshotDocs.length }, 'Deleted all wellbeing data');
    return true;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to delete wellbeing data');
    return false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const wellbeingPersistence = {
  persistSnapshot,
  loadSnapshots,
  persistProfile,
  loadProfile,
  exportWellbeingData,
  deleteWellbeingData,
  clearCache: clearCacheForUser,
};

export default wellbeingPersistence;
