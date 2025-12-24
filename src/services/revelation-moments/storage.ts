/**
 * Revelation Moments Storage
 *
 * Persists revelation profiles to Firestore and provides
 * caching for performance.
 *
 * Storage path: bogle_users/{userId}/revelation_profile/data
 *
 * @module services/revelation-moments/storage
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  RevelationProfile,
  RevelationMoment,
  RevelationType,
  CapabilityCategory,
} from './types.js';
import { createEmptyRevelationProfile, revelationToCategory } from './types.js';

const log = createLogger({ module: 'revelation-storage' });

// ============================================================================
// CACHE
// ============================================================================

const profileCache = new Map<string, { profile: RevelationProfile; loadedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// FIRESTORE ACCESS
// ============================================================================

async function getDb(): Promise<FirebaseFirestore.Firestore | null> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    return getFirestoreDb();
  } catch {
    log.debug('Firestore not available');
    return null;
  }
}

// ============================================================================
// LOAD / SAVE
// ============================================================================

/**
 * Load revelation profile for a user
 */
export async function loadRevelationProfile(userId: string): Promise<RevelationProfile | null> {
  // Check cache first
  const cached = profileCache.get(userId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.profile;
  }

  const db = await getDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore, returning null');
    return null;
  }

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('revelation_profile')
      .doc('data')
      .get();

    if (!doc.exists) {
      log.debug({ userId }, 'No revelation profile found');
      return null;
    }

    const profile = doc.data() as RevelationProfile;

    // Update cache
    profileCache.set(userId, { profile, loadedAt: Date.now() });

    return profile;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load revelation profile');
    return null;
  }
}

/**
 * Save revelation profile
 */
export async function saveRevelationProfile(profile: RevelationProfile): Promise<void> {
  const db = await getDb();
  if (!db) {
    log.debug({ userId: profile.userId }, 'No Firestore, skipping save');
    return;
  }

  try {
    profile.updatedAt = Date.now();

    await db
      .collection('bogle_users')
      .doc(profile.userId)
      .collection('revelation_profile')
      .doc('data')
      .set(profile, { merge: true });

    // Update cache
    profileCache.set(profile.userId, { profile, loadedAt: Date.now() });

    log.debug({ userId: profile.userId }, 'Saved revelation profile');
  } catch (error) {
    log.error(
      { error: String(error), userId: profile.userId },
      'Failed to save revelation profile'
    );
  }
}

// ============================================================================
// REVELATION TRACKING
// ============================================================================

/**
 * Record a revelation moment (first time user experienced a capability)
 */
export async function recordRevelation(
  userId: string,
  revelation: Omit<RevelationMoment, 'occurredAt'>
): Promise<boolean> {
  let profile = await loadRevelationProfile(userId);

  if (!profile) {
    profile = createEmptyRevelationProfile(userId);
  }

  // Check if this revelation type already exists
  if (profile.revelations[revelation.type]) {
    log.debug({ userId, type: revelation.type }, 'Revelation already recorded, skipping');
    return false;
  }

  // Record the revelation
  const moment: RevelationMoment = {
    ...revelation,
    occurredAt: Date.now(),
  };

  profile.revelations[revelation.type] = moment;
  profile.totalRevelations++;

  await saveRevelationProfile(profile);

  log.info(
    { userId, type: revelation.type, context: revelation.context },
    '✨ New revelation moment recorded'
  );

  return true;
}

/**
 * Check if a revelation has occurred
 */
export async function hasRevelation(userId: string, type: RevelationType): Promise<boolean> {
  const profile = await loadRevelationProfile(userId);
  return !!profile?.revelations[type];
}

/**
 * Get all revelations for a user
 */
export async function getRevelations(
  userId: string
): Promise<Partial<Record<RevelationType, RevelationMoment>>> {
  const profile = await loadRevelationProfile(userId);
  return profile?.revelations ?? {};
}

// ============================================================================
// SESSION THROTTLING
// ============================================================================

/**
 * Record capability use in current session (for throttling)
 */
export async function recordCapabilityUse(
  userId: string,
  sessionId: string,
  category: CapabilityCategory
): Promise<void> {
  let profile = await loadRevelationProfile(userId);

  if (!profile) {
    profile = createEmptyRevelationProfile(userId);
  }

  // Reset if new session
  if (profile.lastSessionId !== sessionId) {
    profile.currentSessionCapabilities = [];
    profile.lastSessionId = sessionId;
  }

  // Add capability use
  profile.currentSessionCapabilities.push(category);

  await saveRevelationProfile(profile);
}

/**
 * Check how many times a capability has been used this session
 */
export async function getCapabilityUseCount(
  userId: string,
  sessionId: string,
  category: CapabilityCategory
): Promise<number> {
  const profile = await loadRevelationProfile(userId);

  if (!profile || profile.lastSessionId !== sessionId) {
    return 0;
  }

  return profile.currentSessionCapabilities.filter((c) => c === category).length;
}

/**
 * Get all capability uses this session
 */
export async function getSessionCapabilities(
  userId: string,
  sessionId: string
): Promise<CapabilityCategory[]> {
  const profile = await loadRevelationProfile(userId);

  if (!profile || profile.lastSessionId !== sessionId) {
    return [];
  }

  return profile.currentSessionCapabilities as CapabilityCategory[];
}

// ============================================================================
// USER RESPONSE TRACKING
// ============================================================================

/**
 * Record how user responded to a revelation
 */
export async function recordRevelationResponse(
  userId: string,
  type: RevelationType,
  response: RevelationMoment['userResponse']
): Promise<void> {
  const profile = await loadRevelationProfile(userId);

  if (!profile?.revelations[type]) {
    return;
  }

  profile.revelations[type]!.userResponse = response;
  await saveRevelationProfile(profile);

  log.debug({ userId, type, response }, 'Recorded revelation response');
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get revelation stats for a user
 */
export async function getRevelationStats(userId: string): Promise<{
  totalRevelations: number;
  revelationsByCategory: Record<CapabilityCategory, number>;
  positiveResponses: number;
  negativeResponses: number;
}> {
  const profile = await loadRevelationProfile(userId);

  if (!profile) {
    return {
      totalRevelations: 0,
      revelationsByCategory: {} as Record<CapabilityCategory, number>,
      positiveResponses: 0,
      negativeResponses: 0,
    };
  }

  const revelationsByCategory: Record<CapabilityCategory, number> = {
    memory: 0,
    pattern: 0,
    anticipation: 0,
    growth: 0,
    challenge: 0,
    synthesis: 0,
    team: 0,
  };

  let positiveResponses = 0;
  let negativeResponses = 0;

  for (const [type, moment] of Object.entries(profile.revelations)) {
    if (!moment) continue;

    const category = revelationToCategory(type as RevelationType);
    revelationsByCategory[category]++;

    if (moment.userResponse === 'positive') positiveResponses++;
    if (moment.userResponse === 'negative') negativeResponses++;
  }

  return {
    totalRevelations: profile.totalRevelations,
    revelationsByCategory,
    positiveResponses,
    negativeResponses,
  };
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

export function clearRevelationCache(userId: string): void {
  profileCache.delete(userId);
}

export function clearAllRevelationCache(): void {
  profileCache.clear();
}
