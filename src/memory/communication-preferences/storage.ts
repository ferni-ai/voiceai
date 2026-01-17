/**
 * Communication Preferences Storage
 *
 * Stores each preference observation as a separate document:
 * bogle_users/{userId}/communication_preferences/{preferenceId}
 *
 * Benefits over legacy single-document approach:
 * - Individual TTL per preference
 * - Better querying (by dimension, confidence, etc.)
 * - Firestore index support for ordering
 * - Smaller document sizes
 *
 * @module memory/communication-preferences/storage
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import type {
  CommunicationPreference,
  PreferenceDimension,
  PreferenceInput,
} from './types.js';
import { PREFERENCE_CONFIG } from './types.js';

const log = createLogger({ module: 'comm-pref-storage' });

// ============================================================================
// FIRESTORE ACCESS
// ============================================================================

async function getDb(): Promise<FirebaseFirestore.Firestore | null> {
  try {
    const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
    return getFirestoreDb();
  } catch {
    log.debug('Firestore not available');
    return null;
  }
}

function getPreferencesCollection(
  db: FirebaseFirestore.Firestore,
  userId: string
): FirebaseFirestore.CollectionReference {
  return db.collection('bogle_users').doc(userId).collection('communication_preferences');
}

// ============================================================================
// ID GENERATION
// ============================================================================

/**
 * Generate deterministic ID from dimension + approach for upsert behavior
 */
function generatePreferenceId(dimension: string, ourApproach: string): string {
  const normalized = `${dimension}:${ourApproach}`.toLowerCase().replace(/\s+/g, '_');
  // Create a short hash-like ID
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `pref_${Math.abs(hash).toString(36)}`;
}

/**
 * Calculate expiration date
 */
function calculateExpiresAt(): string {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + PREFERENCE_CONFIG.TTL_DAYS);
  return expiresAt.toISOString();
}

// ============================================================================
// STORAGE OPERATIONS
// ============================================================================

/**
 * Observe a communication preference interaction.
 * Uses upsert logic - if same dimension+approach exists, boost confidence.
 */
export async function observePreference(
  userId: string,
  input: PreferenceInput
): Promise<CommunicationPreference> {
  const db = await getDb();
  const id = generatePreferenceId(input.dimension, input.ourApproach);
  const now = new Date().toISOString();

  // Default preference structure
  let preference: CommunicationPreference = {
    id,
    userId,
    dimension: input.dimension,
    ourApproach: input.ourApproach,
    userResponse: input.userResponse,
    situation: input.situation,
    confidence: input.confidence,
    observationCount: 1,
    createdAt: now,
    updatedAt: now,
    expiresAt: calculateExpiresAt(),
  };

  if (db) {
    try {
      const collection = getPreferencesCollection(db, userId);
      const docRef = collection.doc(id);
      const existing = await docRef.get();

      if (existing.exists) {
        // Boost confidence and update
        const existingData = existing.data() as CommunicationPreference;
        const newConfidence = Math.min(
          PREFERENCE_CONFIG.MAX_CONFIDENCE,
          existingData.confidence + PREFERENCE_CONFIG.CONFIDENCE_BOOST
        );

        preference = {
          ...existingData,
          userResponse: input.userResponse,
          situation: input.situation,
          confidence: newConfidence,
          observationCount: existingData.observationCount + 1,
          updatedAt: now,
          expiresAt: calculateExpiresAt(), // Refresh TTL on observation
        };

        await docRef.update(cleanForFirestore({
          userResponse: preference.userResponse,
          situation: preference.situation,
          confidence: preference.confidence,
          observationCount: preference.observationCount,
          updatedAt: preference.updatedAt,
          expiresAt: preference.expiresAt,
        }));

        log.debug(
          { userId, dimension: input.dimension, confidence: newConfidence },
          'Boosted preference confidence'
        );
      } else {
        // Create new preference
        await docRef.set(cleanForFirestore(preference));
        log.debug({ userId, dimension: input.dimension }, 'Created new preference');
      }
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to observe preference');
    }
  }

  return preference;
}

/**
 * Get all preferences for a user, optionally filtered by dimension
 */
export async function getPreferences(
  userId: string,
  options: {
    dimension?: PreferenceDimension | string;
    minConfidence?: number;
    limit?: number;
  } = {}
): Promise<CommunicationPreference[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const collection = getPreferencesCollection(db, userId);
    let query: FirebaseFirestore.Query = collection;

    // Filter by dimension if specified
    if (options.dimension) {
      query = query.where('dimension', '==', options.dimension);
    }

    // Filter by minimum confidence
    if (options.minConfidence !== undefined) {
      query = query.where('confidence', '>=', options.minConfidence);
    }

    // Order by confidence (highest first) and limit
    query = query
      .orderBy('confidence', 'desc')
      .limit(options.limit ?? 50);

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => doc.data() as CommunicationPreference);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get preferences');
    return [];
  }
}

/**
 * Get preferences ready for context injection
 * Returns only high-confidence preferences suitable for guiding conversation
 */
export async function getPreferencesForContext(userId: string): Promise<CommunicationPreference[]> {
  return getPreferences(userId, {
    minConfidence: PREFERENCE_CONFIG.MIN_CONFIDENCE_FOR_CONTEXT,
    limit: 20,
  });
}

/**
 * Get preference by dimension (returns highest confidence one)
 */
export async function getPreferenceByDimension(
  userId: string,
  dimension: PreferenceDimension | string
): Promise<CommunicationPreference | null> {
  const preferences = await getPreferences(userId, {
    dimension,
    limit: 1,
  });
  return preferences[0] ?? null;
}

/**
 * Delete all preferences for a user (GDPR compliance)
 */
export async function deleteAllPreferences(userId: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  try {
    const collection = getPreferencesCollection(db, userId);
    const snapshot = await collection.limit(500).get();

    if (snapshot.empty) return 0;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    log.info({ userId, deleted: snapshot.size }, 'Deleted all communication preferences');
    return snapshot.size;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to delete preferences');
    return 0;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  observePreference,
  getPreferences,
  getPreferencesForContext,
  getPreferenceByDimension,
  deleteAllPreferences,
};
