/**
 * Coaching Profile Persistence
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Handles persistence of all coaching-related profiles to Firestore.
 * Ensures coaching data survives across sessions.
 *
 * @module CoachingPersistence
 */

import { getGCPProjectId } from '../../config/environment.js';
import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'CoachingPersistence' });

// ============================================================================
// TYPES
// ============================================================================

export interface CoachingProfileBundle {
  userId: string;
  lastUpdated: Date;

  // All coaching profiles
  goalProfile?: ReturnType<typeof import('./goal-tracking.js').exportGoalProfile>;
  actionProfile?: ReturnType<typeof import('./action-planning.js').exportActionProfile>;
  obstacleProfile?: ReturnType<typeof import('./obstacle-detection.js').exportObstacleProfile>;
  styleProfile?: ReturnType<typeof import('./style-adaptation.js').exportStyleProfile>;
  granularityProfile?: ReturnType<
    typeof import('./emotional-granularity.js').exportGranularityProfile
  >;
  journeyProfile?: ReturnType<typeof import('./journey-tracking.js').exportJourneyProfile>;
  valuesProfile?: ReturnType<typeof import('./values-coaching.js').exportValuesProfile>;
  progressProfile?: ReturnType<typeof import('./progress-metrics.js').exportProgressProfile>;
  seasonalProfile?: ReturnType<typeof import('./seasonal-awareness.js').exportSeasonalProfile>;
  engagementProfile?: ReturnType<typeof import('./reengagement.js').exportEngagementProfile>;
  teamExperience?: ReturnType<typeof import('./handoff-intelligence.js').exportTeamExperience>;
  teamContext?: ReturnType<typeof import('./cross-persona-context.js').exportTeamContext>;
}

// ============================================================================
// LAZY IMPORTS
// ============================================================================

let coachingModules: {
  goalTracking: typeof import('./goal-tracking.js');
  actionPlanning: typeof import('./action-planning.js');
  obstacleDetection: typeof import('./obstacle-detection.js');
  styleAdaptation: typeof import('./style-adaptation.js');
  emotionalGranularity: typeof import('./emotional-granularity.js');
  journeyTracking: typeof import('./journey-tracking.js');
  valuesCoaching: typeof import('./values-coaching.js');
  progressMetrics: typeof import('./progress-metrics.js');
  seasonalAwareness: typeof import('./seasonal-awareness.js');
  reengagement: typeof import('./reengagement.js');
  handoffIntelligence: typeof import('./handoff-intelligence.js');
  crossPersonaContext: typeof import('./cross-persona-context.js');
} | null = null;

async function getModules() {
  if (!coachingModules) {
    const [
      goalTracking,
      actionPlanning,
      obstacleDetection,
      styleAdaptation,
      emotionalGranularity,
      journeyTracking,
      valuesCoaching,
      progressMetrics,
      seasonalAwareness,
      reengagement,
      handoffIntelligence,
      crossPersonaContext,
    ] = await Promise.all([
      import('./goal-tracking.js'),
      import('./action-planning.js'),
      import('./obstacle-detection.js'),
      import('./style-adaptation.js'),
      import('./emotional-granularity.js'),
      import('./journey-tracking.js'),
      import('./values-coaching.js'),
      import('./progress-metrics.js'),
      import('./seasonal-awareness.js'),
      import('./reengagement.js'),
      import('./handoff-intelligence.js'),
      import('./cross-persona-context.js'),
    ]);

    coachingModules = {
      goalTracking,
      actionPlanning,
      obstacleDetection,
      styleAdaptation,
      emotionalGranularity,
      journeyTracking,
      valuesCoaching,
      progressMetrics,
      seasonalAwareness,
      reengagement,
      handoffIntelligence,
      crossPersonaContext,
    };
  }
  return coachingModules;
}

// ============================================================================
// EXPORT ALL PROFILES
// ============================================================================

/**
 * Export all coaching profiles for a user
 */
export async function exportAllCoachingProfiles(userId: string): Promise<CoachingProfileBundle> {
  const modules = await getModules();

  const bundle: CoachingProfileBundle = {
    userId,
    lastUpdated: new Date(),
    goalProfile: modules.goalTracking.exportGoalProfile(userId),
    actionProfile: modules.actionPlanning.exportActionProfile(userId),
    obstacleProfile: modules.obstacleDetection.exportObstacleProfile(userId),
    styleProfile: modules.styleAdaptation.exportStyleProfile(userId),
    granularityProfile: modules.emotionalGranularity.exportGranularityProfile(userId),
    journeyProfile: modules.journeyTracking.exportJourneyProfile(userId),
    valuesProfile: modules.valuesCoaching.exportValuesProfile(userId),
    progressProfile: modules.progressMetrics.exportProgressProfile(userId),
    seasonalProfile: modules.seasonalAwareness.exportSeasonalProfile(userId),
    engagementProfile: modules.reengagement.exportEngagementProfile(userId),
    teamExperience: modules.handoffIntelligence.exportTeamExperience(userId),
    teamContext: modules.crossPersonaContext.exportTeamContext(userId),
  };

  log.debug(
    {
      userId,
      profileCount: Object.keys(bundle).filter((k) => bundle[k as keyof CoachingProfileBundle])
        .length,
    },
    'Exported coaching profiles'
  );

  return bundle;
}

// ============================================================================
// IMPORT ALL PROFILES
// ============================================================================

/**
 * Import all coaching profiles for a user
 */
export async function importAllCoachingProfiles(bundle: CoachingProfileBundle): Promise<void> {
  const modules = await getModules();
  const { userId } = bundle;

  // Import each profile if it exists
  if (bundle.goalProfile) {
    modules.goalTracking.importGoalProfile(bundle.goalProfile);
  }
  if (bundle.actionProfile) {
    modules.actionPlanning.importActionProfile(bundle.actionProfile);
  }
  if (bundle.obstacleProfile) {
    modules.obstacleDetection.importObstacleProfile(bundle.obstacleProfile);
  }
  if (bundle.styleProfile) {
    modules.styleAdaptation.importStyleProfile(bundle.styleProfile);
  }
  if (bundle.granularityProfile) {
    modules.emotionalGranularity.importGranularityProfile(bundle.granularityProfile);
  }
  if (bundle.journeyProfile) {
    modules.journeyTracking.importJourneyProfile(bundle.journeyProfile);
  }
  if (bundle.valuesProfile) {
    modules.valuesCoaching.importValuesProfile(bundle.valuesProfile);
  }
  if (bundle.progressProfile) {
    modules.progressMetrics.importProgressProfile(bundle.progressProfile);
  }
  if (bundle.seasonalProfile) {
    modules.seasonalAwareness.importSeasonalProfile(bundle.seasonalProfile);
  }
  if (bundle.engagementProfile) {
    modules.reengagement.importEngagementProfile(bundle.engagementProfile);
  }
  if (bundle.teamExperience) {
    modules.handoffIntelligence.importTeamExperience(bundle.teamExperience);
  }
  if (bundle.teamContext) {
    modules.crossPersonaContext.importTeamContext(bundle.teamContext);
  }

  log.info({ userId }, '📥 Imported all coaching profiles');
}

// ============================================================================
// FIRESTORE INTEGRATION
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let firestoreClient: any | null = null;
let firestoreAvailable = false;

const COACHING_COLLECTION = 'coaching_profiles';

/**
 * Initialize Firestore for coaching persistence
 */
async function initializeFirestore(): Promise<boolean> {
  if (firestoreClient) return firestoreAvailable;

  try {
    // Dynamic import to avoid issues if Firebase isn't configured
    const admin = await import('firebase-admin');

    // Check if already initialized
    if (admin.apps.length === 0) {
      try {
        admin.initializeApp({
          projectId: getGCPProjectId(),
        });
      } catch {
        log.warn('Firebase not configured - using in-memory storage for coaching');
        return false;
      }
    }

    firestoreClient = admin.firestore();
    firestoreAvailable = true;
    log.info('✅ Firestore initialized for coaching persistence');
    return true;
  } catch (error) {
    log.warn(
      { error: String(error) },
      'Firestore not available - using in-memory storage for coaching'
    );
    firestoreAvailable = false;
    return false;
  }
}

/**
 * Save coaching profiles to Firestore
 */
export async function saveCoachingProfilesToFirestore(userId: string): Promise<boolean> {
  try {
    const available = await initializeFirestore();
    if (!available || !firestoreClient) {
      log.debug({ userId }, 'Firestore not available, skipping save');
      return false;
    }

    const bundle = await exportAllCoachingProfiles(userId);

    // Serialize dates for Firestore
    const serialized = structuredClone(bundle);

    await firestoreClient
      .collection(COACHING_COLLECTION)
      .doc(userId)
      .set(cleanForFirestore(serialized));

    log.info({ userId }, '💾 Saved coaching profiles to Firestore');
    return true;
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to save coaching profiles');
    return false;
  }
}

/**
 * Load coaching profiles from Firestore
 */
export async function loadCoachingProfilesFromFirestore(userId: string): Promise<boolean> {
  try {
    const available = await initializeFirestore();
    if (!available || !firestoreClient) {
      log.debug({ userId }, 'Firestore not available, skipping load');
      return false;
    }

    const docRef = firestoreClient.collection(COACHING_COLLECTION).doc(userId);
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      log.debug({ userId }, 'No coaching profiles found in Firestore');
      return false;
    }

    const data = snapshot.data() as CoachingProfileBundle;
    await importAllCoachingProfiles(data);

    log.info({ userId }, '📂 Loaded coaching profiles from Firestore');
    return true;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Failed to load coaching profiles');
    return false;
  }
}

// ============================================================================
// SESSION LIFECYCLE HOOKS
// ============================================================================

/**
 * Initialize coaching profiles at session start
 * Call this when a user session begins
 */
export async function initializeCoachingForSession(userId: string): Promise<void> {
  // Try to load existing profiles
  const loaded = await loadCoachingProfilesFromFirestore(userId);

  if (!loaded) {
    log.debug({ userId }, 'Starting fresh coaching profiles');
  }
}

/**
 * Persist coaching profiles at session end
 * Call this when a user session ends
 */
export async function persistCoachingForSession(userId: string): Promise<void> {
  await saveCoachingProfilesToFirestore(userId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  exportAllCoachingProfiles,
  importAllCoachingProfiles,
  saveCoachingProfilesToFirestore,
  loadCoachingProfilesFromFirestore,
  initializeCoachingForSession,
  persistCoachingForSession,
};
