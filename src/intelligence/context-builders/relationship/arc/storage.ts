/**
 * Relationship Arc Storage
 *
 * Persists relationship arc data to Firestore and provides
 * caching for performance.
 *
 * Storage path: bogle_users/{userId}/relationship_arc/data
 *
 * @module intelligence/context-builders/relationship/arc/storage
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import type {
  RelationshipArcData,
  FirstMeetingData,
  KeyMoment,
  StageTransition,
  SharedVocabulary,
  RelationshipStage,
} from './types.js';
import { createDefaultRelationshipArcData, determineStage, generateMomentId } from './types.js';

const log = createLogger({ module: 'relationship-arc-storage' });

// ============================================================================
// CACHE
// ============================================================================

const arcCache = new Map<string, { data: RelationshipArcData; loadedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// FIRESTORE ACCESS
// ============================================================================

/**
 * Get Firestore database (lazy import to avoid circular deps)
 */
async function getDb(): Promise<FirebaseFirestore.Firestore | null> {
  try {
    const { getFirestoreDb } = await import('../../../services/superhuman/firestore-utils.js');
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
 * Load relationship arc data for a user
 */
export async function loadRelationshipArcData(userId: string): Promise<RelationshipArcData | null> {
  // Check cache first
  const cached = arcCache.get(userId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.data;
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
      .collection('relationship_arc')
      .doc('data')
      .get();

    if (!doc.exists) {
      log.debug({ userId }, 'No relationship arc data found');
      return null;
    }

    const data = doc.data() as RelationshipArcData;

    // Update cache
    arcCache.set(cleanForFirestore(userId), { data, loadedAt: Date.now() });

    log.debug({ userId, stage: data.currentStage }, 'Loaded relationship arc data');
    return data;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load relationship arc data');
    return null;
  }
}

/**
 * Save relationship arc data
 */
export async function saveRelationshipArcData(data: RelationshipArcData): Promise<void> {
  const db = await getDb();
  if (!db) {
    log.debug({ userId: data.userId }, 'No Firestore, skipping save');
    return;
  }

  try {
    await db
      .collection('bogle_users')
      .doc(data.userId)
      .collection('relationship_arc')
      .doc('data')
      .set(cleanForFirestore(data), { merge: true });

    // Update cache
    arcCache.set(data.userId, { data, loadedAt: Date.now() });

    log.debug({ userId: data.userId, stage: data.currentStage }, 'Saved relationship arc data');
  } catch (error) {
    log.error(
      { error: String(error), userId: data.userId },
      'Failed to save relationship arc data'
    );
  }
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Record first meeting data
 */
export async function recordFirstMeeting(
  userId: string,
  firstMeeting: FirstMeetingData
): Promise<void> {
  let data = await loadRelationshipArcData(userId);

  if (!data) {
    data = createDefaultRelationshipArcData(userId);
  }

  // Only record if we don't already have first meeting data
  if (!data.firstMeeting) {
    data.firstMeeting = firstMeeting;
    data.firstSessionDate = firstMeeting.timestamp;
    await saveRelationshipArcData(data);
    log.info({ userId, energy: firstMeeting.detectedEnergy }, '🌟 First meeting recorded');
  }
}

/**
 * Record a key moment
 */
export async function recordKeyMoment(
  userId: string,
  moment: Omit<KeyMoment, 'id' | 'referencedCount'>
): Promise<string> {
  let data = await loadRelationshipArcData(userId);

  if (!data) {
    data = createDefaultRelationshipArcData(userId);
  }

  const id = generateMomentId();
  const fullMoment: KeyMoment = {
    ...moment,
    id,
    referencedCount: 0,
  };

  data.keyMoments.push(fullMoment);

  // Update counts
  if (moment.type === 'vulnerability') data.vulnerabilityCount++;
  if (moment.type === 'breakthrough') data.breakthroughCount++;
  if (moment.type === 'celebration') data.celebrationCount++;

  // Keep only last 50 moments
  if (data.keyMoments.length > 50) {
    data.keyMoments = data.keyMoments.slice(-50);
  }

  await saveRelationshipArcData(data);
  log.debug({ userId, momentType: moment.type }, '📌 Key moment recorded');

  return id;
}

/**
 * Mark that we've made a first-words callback
 */
export async function markFirstWordsCallbackMade(userId: string): Promise<void> {
  const data = await loadRelationshipArcData(userId);
  if (!data?.firstMeeting) return;

  data.firstMeeting.firstWordsCallbackMade = true;
  await saveRelationshipArcData(data);
}

/**
 * Mark that we've referenced a milestone
 */
export async function markMilestoneReferenced(userId: string, milestoneId: string): Promise<void> {
  const data = await loadRelationshipArcData(userId);
  if (!data) return;

  if (!data.referencedMilestones.includes(milestoneId)) {
    data.referencedMilestones.push(milestoneId);
    data.lastMilestoneReference = Date.now();
    await saveRelationshipArcData(data);
  }
}

/**
 * Add shared vocabulary
 */
export async function addSharedVocabulary(
  userId: string,
  vocab: Omit<SharedVocabulary, 'firstUsed' | 'useCount'>
): Promise<void> {
  let data = await loadRelationshipArcData(userId);

  if (!data) {
    data = createDefaultRelationshipArcData(userId);
  }

  const existing = data.sharedVocabulary.find((v) => v.term === vocab.term);
  if (existing) {
    existing.useCount++;
  } else {
    data.sharedVocabulary.push({
      ...vocab,
      firstUsed: Date.now(),
      useCount: 1,
    });
  }

  // Keep only top 30 by use count
  data.sharedVocabulary.sort((a, b) => b.useCount - a.useCount);
  data.sharedVocabulary = data.sharedVocabulary.slice(0, 30);

  await saveRelationshipArcData(data);
}

/**
 * Increment session and turn counts
 */
export async function incrementSessionStats(userId: string, turnCount: number): Promise<void> {
  let data = await loadRelationshipArcData(userId);

  if (!data) {
    data = createDefaultRelationshipArcData(userId);
  }

  data.totalSessions++;
  data.totalTurns += turnCount;
  data.lastSessionDate = Date.now();

  // Check for stage transition
  const newStage = determineStage(data.totalSessions);
  if (newStage !== data.currentStage) {
    const transition: StageTransition = {
      from: data.currentStage,
      to: newStage,
      timestamp: Date.now(),
      trigger: `Reached ${data.totalSessions} sessions`,
      sessionNumber: data.totalSessions,
    };
    data.stageTransitions.push(transition);
    data.currentStage = newStage;
    log.info({ userId, from: transition.from, to: transition.to }, '🎉 Stage transition!');
  }

  await saveRelationshipArcData(data);
}

/**
 * Force a stage transition (e.g., for trust-based advancement)
 */
export async function forceStageTransition(
  userId: string,
  newStage: RelationshipStage,
  trigger: string
): Promise<void> {
  let data = await loadRelationshipArcData(userId);

  if (!data) {
    data = createDefaultRelationshipArcData(userId);
  }

  if (newStage === data.currentStage) return;

  const transition: StageTransition = {
    from: data.currentStage,
    to: newStage,
    timestamp: Date.now(),
    trigger,
    sessionNumber: data.totalSessions,
  };
  data.stageTransitions.push(transition);
  data.currentStage = newStage;

  await saveRelationshipArcData(data);
  log.info(
    { userId, from: transition.from, to: transition.to, trigger },
    '🎉 Forced stage transition'
  );
}

// ============================================================================
// QUERY OPERATIONS
// ============================================================================

/**
 * Get unreferenced key moments for callbacks (by userId - async)
 */
export async function getUnreferencedMomentsAsync(userId: string, limit = 5): Promise<KeyMoment[]> {
  const data = await loadRelationshipArcData(userId);
  if (!data) return [];

  // Find moments that haven't been referenced much
  return data.keyMoments
    .filter((m) => m.referencedCount < 2)
    .sort((a, b) => a.referencedCount - b.referencedCount)
    .slice(0, limit);
}

/**
 * Get unreferenced key moments (sync helper)
 * Use when you already have arc data loaded
 */
export function getUnreferencedMoments(
  arcData: RelationshipArcData,
  type?: KeyMoment['type'],
  limit = 5
): KeyMoment[] {
  return arcData.keyMoments
    .filter((m) => m.referencedCount === 0 && (!type || m.type === type))
    .slice(0, limit);
}

/**
 * Get moments by type (by userId - async)
 */
export async function getMomentsByTypeAsync(
  userId: string,
  type: KeyMoment['type']
): Promise<KeyMoment[]> {
  const data = await loadRelationshipArcData(userId);
  if (!data) return [];

  return data.keyMoments.filter((m) => m.type === type);
}

/**
 * Get moments by type (sync helper)
 * Use when you already have arc data loaded
 */
export function getMomentsByType(
  arcData: RelationshipArcData,
  type: KeyMoment['type']
): KeyMoment[] {
  return arcData.keyMoments.filter((m) => m.type === type);
}

/**
 * Check if first-words callback can be made
 */
/**
 * Check if we can make a first-words callback (by userId - async)
 */
export async function canMakeFirstWordsCallbackAsync(userId: string): Promise<boolean> {
  const data = await loadRelationshipArcData(userId);
  if (!data?.firstMeeting) return false;

  return !data.firstMeeting.firstWordsCallbackMade && data.totalSessions >= 3;
}

/**
 * Check if we can make a first-words callback (sync helper)
 * Use this when you already have the arc data loaded
 */
export function canMakeFirstWordsCallback(arcData: RelationshipArcData): boolean {
  if (!arcData?.firstMeeting) return false;
  return !arcData.firstMeeting.firstWordsCallbackMade && arcData.totalSessions >= 3;
}

/**
 * Get the current relationship stage
 */
export async function getCurrentStage(userId: string): Promise<RelationshipStage> {
  const data = await loadRelationshipArcData(userId);
  return data?.currentStage ?? 'stranger';
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear cache for a user (call on session end)
 */
export function clearArcCache(userId: string): void {
  arcCache.delete(userId);
}

/**
 * Clear all cache
 */
export function clearAllArcCache(): void {
  arcCache.clear();
}

/**
 * Prewarm cache for a user
 */
export async function prewarmArcCache(userId: string): Promise<void> {
  await loadRelationshipArcData(userId);
}
