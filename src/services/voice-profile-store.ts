/**
 * Voice Profile Firestore Store
 *
 * Handles persistence of voice profiles for speaker authentication.
 *
 * Firestore Schema:
 * ```
 * bogle_users/{userId}/
 *   voice_profile/
 *     profile (document)
 *       - userId: string
 *       - displayName: string
 *       - centroid: number[] (192-dim embedding)
 *       - threshold: number
 *       - qualityScore: number
 *       - verificationCount: number
 *       - enrolledAt: timestamp
 *       - updatedAt: timestamp
 *       - lastVerifiedAt: timestamp
 *       - metadata: { deviceTypes, enrollmentDurationMs, sampleCount }
 *
 *     samples/ (subcollection)
 *       {sampleId}
 *         - embedding: number[] (192-dim)
 *         - collectedAt: timestamp
 *         - durationMs: number
 *         - quality: { snr, clarity, confidence }
 *         - context: { deviceType, environment }
 * ```
 *
 * @module VoiceProfileStore
 */

import * as admin from 'firebase-admin';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getLogger } from '../utils/safe-logger.js';
import type { EnrollmentSample, VoiceProfile } from './voice-enrollment.js';

const log = getLogger().child({ module: 'VoiceProfileStore' });

// ============================================================================
// Firebase Initialization
// ============================================================================

let firestoreInstance: Firestore | null = null;
let initAttempted = false;

// In-memory cache for development when Firestore is unavailable
const memoryCache = new Map<string, VoiceProfile>();
const indexCache = new Map<string, { userId: string; centroid: number[]; threshold: number }>();

/**
 * Get Firestore instance with lazy initialization.
 * Returns null if Firebase is not available.
 */
function getFirestoreInstance(): Firestore | null {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  if (initAttempted) {
    return null;
  }
  initAttempted = true;

  try {
    // Check if Firebase is already initialized
    if (admin.apps.length === 0) {
      // Try to initialize with default credentials or project ID
      const projectId =
        process.env.GCP_PROJECT_ID ||
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT;

      if (projectId) {
        admin.initializeApp({ projectId });
        log.info({ projectId }, 'Firebase initialized for voice profiles');
      } else {
        // Try default credentials
        admin.initializeApp();
        log.info('Firebase initialized with default credentials');
      }
    }

    firestoreInstance = admin.firestore();
    return firestoreInstance;
  } catch (error) {
    log.warn({ error }, 'Firebase not available for voice profiles - using in-memory storage');
    return null;
  }
}

// ============================================================================
// Firestore Paths
// ============================================================================

const USERS_COLLECTION = 'bogle_users';
const VOICE_PROFILE_SUBCOLLECTION = 'voice_profile';
const PROFILE_DOC = 'profile';
const SAMPLES_SUBCOLLECTION = 'samples';

/**
 * Get the path to a user's voice profile document.
 */
function getProfilePath(userId: string): string {
  return `${USERS_COLLECTION}/${userId}/${VOICE_PROFILE_SUBCOLLECTION}/${PROFILE_DOC}`;
}

/**
 * Get the path to a user's voice samples collection.
 */
function getSamplesPath(userId: string): string {
  return `${USERS_COLLECTION}/${userId}/${VOICE_PROFILE_SUBCOLLECTION}/${PROFILE_DOC}/${SAMPLES_SUBCOLLECTION}`;
}

// ============================================================================
// Firestore Document Types
// ============================================================================

interface FirestoreVoiceProfile {
  userId: string;
  displayName?: string;
  centroid: number[];
  threshold: number;
  qualityScore: number;
  verificationCount: number;
  enrolledAt: Timestamp;
  updatedAt: Timestamp;
  lastVerifiedAt?: Timestamp;
  metadata: {
    deviceTypes: string[];
    enrollmentDurationMs: number;
    sampleCount: number;
  };
}

interface FirestoreEnrollmentSample {
  embedding: number[];
  collectedAt: Timestamp;
  durationMs: number;
  quality: {
    snr?: number;
    clarity?: number;
    confidence: number;
  };
  context?: {
    deviceType?: string;
    environment?: string;
  };
}

// ============================================================================
// Store Functions
// ============================================================================

/**
 * Save a voice profile to Firestore.
 */
export async function saveVoiceProfile(profile: VoiceProfile): Promise<void> {
  const db = getFirestoreInstance();

  // Save to memory cache (always)
  memoryCache.set(profile.userId, profile);
  log.debug({ userId: profile.userId }, 'Voice profile cached in memory');

  if (!db) {
    log.warn({ userId: profile.userId }, 'Firestore not available - profile saved to memory only');
    return;
  }

  try {
    // Convert to Firestore format
    const firestoreProfile: FirestoreVoiceProfile = {
      userId: profile.userId,
      displayName: profile.displayName,
      centroid: profile.centroid,
      threshold: profile.threshold,
      qualityScore: profile.qualityScore,
      verificationCount: profile.verificationCount,
      enrolledAt: Timestamp.fromDate(profile.enrolledAt),
      updatedAt: Timestamp.fromDate(profile.updatedAt),
      lastVerifiedAt: profile.lastVerifiedAt
        ? Timestamp.fromDate(profile.lastVerifiedAt)
        : undefined,
      metadata: profile.metadata,
    };

    // Save profile document
    const profileRef = db.doc(getProfilePath(profile.userId));
    await profileRef.set(firestoreProfile);

    // Save samples in subcollection
    const samplesRef = db.collection(getSamplesPath(profile.userId));

    // Delete existing samples
    const existingSamples = await samplesRef.listDocuments();
    const batch = db.batch();
    existingSamples.forEach((doc) => batch.delete(doc));

    // Add new samples
    for (const sample of profile.embeddings) {
      const sampleDoc: FirestoreEnrollmentSample = {
        embedding: sample.embedding,
        collectedAt: Timestamp.fromDate(sample.collectedAt),
        durationMs: sample.durationMs,
        quality: sample.quality,
        context: sample.context,
      };
      batch.set(samplesRef.doc(), sampleDoc);
    }

    await batch.commit();

    log.info({ userId: profile.userId }, 'Voice profile saved');
  } catch (error) {
    log.error({ error, userId: profile.userId }, 'Failed to save voice profile');
    throw error;
  }
}

/**
 * Load a voice profile from Firestore.
 */
export async function loadVoiceProfile(userId: string): Promise<VoiceProfile | null> {
  // Check memory cache first
  const cached = memoryCache.get(userId);
  if (cached) {
    log.debug({ userId }, 'Loaded voice profile from memory cache');
    return cached;
  }

  const db = getFirestoreInstance();
  if (!db) {
    return null;
  }

  try {
    // Load profile document
    const profileRef = db.doc(getProfilePath(userId));
    const profileDoc = await profileRef.get();

    if (!profileDoc.exists) {
      return null;
    }

    const data = profileDoc.data() as FirestoreVoiceProfile;

    // Load samples
    const samplesRef = db.collection(getSamplesPath(userId));
    const samplesSnapshot = await samplesRef.orderBy('collectedAt', 'desc').get();

    const samples: EnrollmentSample[] = samplesSnapshot.docs.map((doc) => {
      const sampleData = doc.data() as FirestoreEnrollmentSample;
      return {
        embedding: sampleData.embedding,
        collectedAt: sampleData.collectedAt.toDate(),
        durationMs: sampleData.durationMs,
        quality: sampleData.quality,
        context: sampleData.context,
      };
    });

    // Convert to VoiceProfile
    const profile: VoiceProfile = {
      userId: data.userId,
      displayName: data.displayName,
      embeddings: samples,
      centroid: data.centroid,
      threshold: data.threshold,
      qualityScore: data.qualityScore,
      verificationCount: data.verificationCount,
      enrolledAt: data.enrolledAt.toDate(),
      updatedAt: data.updatedAt.toDate(),
      lastVerifiedAt: data.lastVerifiedAt?.toDate(),
      metadata: data.metadata,
    };

    return profile;
  } catch (error) {
    log.error({ error, userId }, 'Failed to load voice profile');
    throw error;
  }
}

/**
 * Check if a user has a voice profile.
 */
export async function hasVoiceProfile(userId: string): Promise<boolean> {
  // Check memory cache first
  if (memoryCache.has(userId)) {
    return true;
  }

  const db = getFirestoreInstance();
  if (!db) {
    return false;
  }

  try {
    const profileRef = db.doc(getProfilePath(userId));
    const profileDoc = await profileRef.get();
    return profileDoc.exists;
  } catch (error) {
    log.error({ error, userId }, 'Failed to check voice profile');
    return false;
  }
}

/**
 * Delete a voice profile.
 */
export async function deleteVoiceProfile(userId: string): Promise<void> {
  // Delete from memory cache
  memoryCache.delete(userId);
  indexCache.delete(userId);

  const db = getFirestoreInstance();
  if (!db) {
    log.info({ userId }, 'Voice profile deleted from memory');
    return;
  }

  try {
    // Delete samples first
    const samplesRef = db.collection(getSamplesPath(userId));
    const samples = await samplesRef.listDocuments();

    const batch = db.batch();
    samples.forEach((doc) => batch.delete(doc));

    // Delete profile
    const profileRef = db.doc(getProfilePath(userId));
    batch.delete(profileRef);

    await batch.commit();

    log.info({ userId }, 'Voice profile deleted');
  } catch (error) {
    log.error({ error, userId }, 'Failed to delete voice profile');
    throw error;
  }
}

/**
 * Update verification count and timestamp.
 */
export async function recordVerification(userId: string, success: boolean): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) {
    return; // Silent fail - verification recording is non-critical
  }

  try {
    const profileRef = db.doc(getProfilePath(userId));

    await profileRef.update({
      verificationCount: FieldValue.increment(1),
      lastVerifiedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    log.debug({ userId, success }, 'Recorded verification');
  } catch (error) {
    log.error({ error, userId }, 'Failed to record verification');
    // Non-critical, don't throw
  }
}

/**
 * Load all voice profiles (for identification across users).
 *
 * Note: For production with many users, implement pagination or
 * use a separate index collection.
 */
export async function loadAllVoiceProfiles(options?: { limit?: number }): Promise<VoiceProfile[]> {
  const db = getFirestoreInstance();
  if (!db) {
    return [];
  }
  const limit = options?.limit ?? 100;

  try {
    // Query all users with voice profiles
    // This is inefficient for large user bases - consider a separate index
    const usersSnapshot = await db.collectionGroup(VOICE_PROFILE_SUBCOLLECTION).limit(limit).get();

    const profiles: VoiceProfile[] = [];

    for (const doc of usersSnapshot.docs) {
      if (doc.id !== PROFILE_DOC) continue;

      const data = doc.data() as FirestoreVoiceProfile;

      // Load samples for this profile
      const samplesRef = doc.ref.collection(SAMPLES_SUBCOLLECTION);
      const samplesSnapshot = await samplesRef.get();

      const samples: EnrollmentSample[] = samplesSnapshot.docs.map((sampleDoc) => {
        const sampleData = sampleDoc.data() as FirestoreEnrollmentSample;
        return {
          embedding: sampleData.embedding,
          collectedAt: sampleData.collectedAt.toDate(),
          durationMs: sampleData.durationMs,
          quality: sampleData.quality,
          context: sampleData.context,
        };
      });

      profiles.push({
        userId: data.userId,
        displayName: data.displayName,
        embeddings: samples,
        centroid: data.centroid,
        threshold: data.threshold,
        qualityScore: data.qualityScore,
        verificationCount: data.verificationCount,
        enrolledAt: data.enrolledAt.toDate(),
        updatedAt: data.updatedAt.toDate(),
        lastVerifiedAt: data.lastVerifiedAt?.toDate(),
        metadata: data.metadata,
      });
    }

    log.info({ count: profiles.length }, 'Loaded voice profiles');
    return profiles;
  } catch (error) {
    log.error({ error }, 'Failed to load all voice profiles');
    throw error;
  }
}

/**
 * Get voice profile stats for a user.
 */
export async function getVoiceProfileStats(userId: string): Promise<{
  exists: boolean;
  enrolledAt?: Date;
  qualityScore?: number;
  verificationCount?: number;
  sampleCount?: number;
  needsReEnrollment?: boolean;
} | null> {
  // Check memory cache first
  const cached = memoryCache.get(userId);
  if (cached) {
    return {
      exists: true,
      enrolledAt: cached.enrolledAt,
      qualityScore: cached.qualityScore,
      verificationCount: cached.verificationCount,
      sampleCount: cached.metadata.sampleCount,
      needsReEnrollment: cached.qualityScore < 0.6 || cached.metadata.sampleCount < 3,
    };
  }

  const db = getFirestoreInstance();
  if (!db) {
    return { exists: false };
  }

  try {
    const profileRef = db.doc(getProfilePath(userId));
    const profileDoc = await profileRef.get();

    if (!profileDoc.exists) {
      return { exists: false };
    }

    const data = profileDoc.data() as FirestoreVoiceProfile;

    return {
      exists: true,
      enrolledAt: data.enrolledAt.toDate(),
      qualityScore: data.qualityScore,
      verificationCount: data.verificationCount,
      sampleCount: data.metadata.sampleCount,
      needsReEnrollment: data.qualityScore < 0.6 || data.metadata.sampleCount < 3,
    };
  } catch (error) {
    log.error({ error, userId }, 'Failed to get voice profile stats');
    return null;
  }
}

// ============================================================================
// Index Management (for efficient identification)
// ============================================================================

/**
 * Voice profile index for fast lookup.
 *
 * In production, maintain a separate collection with just centroids
 * for efficient speaker identification across all users.
 */
interface VoiceProfileIndex {
  userId: string;
  centroid: number[];
  threshold: number;
  updatedAt: Timestamp;
}

const VOICE_INDEX_COLLECTION = 'voice_profile_index';

/**
 * Update the voice profile index entry.
 */
export async function updateVoiceProfileIndex(profile: VoiceProfile): Promise<void> {
  // Update memory index cache
  indexCache.set(profile.userId, {
    userId: profile.userId,
    centroid: profile.centroid,
    threshold: profile.threshold,
  });

  const db = getFirestoreInstance();
  if (!db) {
    return;
  }

  try {
    const indexRef = db.collection(VOICE_INDEX_COLLECTION).doc(profile.userId);

    const indexEntry: VoiceProfileIndex = {
      userId: profile.userId,
      centroid: profile.centroid,
      threshold: profile.threshold,
      updatedAt: Timestamp.fromDate(profile.updatedAt),
    };

    await indexRef.set(indexEntry);

    log.debug({ userId: profile.userId }, 'Updated voice profile index');
  } catch (error) {
    log.error({ error, userId: profile.userId }, 'Failed to update voice profile index');
    // Non-critical for enrollment, but log for monitoring
  }
}

/**
 * Load voice profile index for fast identification.
 */
export async function loadVoiceProfileIndex(): Promise<
  Array<{ userId: string; centroid: number[]; threshold: number }>
> {
  const db = getFirestoreInstance();
  if (!db) {
    // Return from memory cache
    return Array.from(indexCache.values());
  }

  try {
    const indexSnapshot = await db.collection(VOICE_INDEX_COLLECTION).get();

    return indexSnapshot.docs.map((doc) => {
      const data = doc.data() as VoiceProfileIndex;
      return {
        userId: data.userId,
        centroid: data.centroid,
        threshold: data.threshold,
      };
    });
  } catch (error) {
    log.error({ error }, 'Failed to load voice profile index');
    return [];
  }
}

/**
 * Remove from voice profile index.
 */
export async function removeFromVoiceProfileIndex(userId: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) {
    return;
  }

  try {
    await db.collection(VOICE_INDEX_COLLECTION).doc(userId).delete();
    log.debug({ userId }, 'Removed from voice profile index');
  } catch (error) {
    log.error({ error, userId }, 'Failed to remove from voice profile index');
  }
}
