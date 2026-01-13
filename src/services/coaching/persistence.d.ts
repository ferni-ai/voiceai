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
export interface CoachingProfileBundle {
    userId: string;
    lastUpdated: Date;
    goalProfile?: ReturnType<typeof import('./goal-tracking.js').exportGoalProfile>;
    actionProfile?: ReturnType<typeof import('./action-planning.js').exportActionProfile>;
    obstacleProfile?: ReturnType<typeof import('./obstacle-detection.js').exportObstacleProfile>;
    styleProfile?: ReturnType<typeof import('./style-adaptation.js').exportStyleProfile>;
    granularityProfile?: ReturnType<typeof import('./emotional-granularity.js').exportGranularityProfile>;
    journeyProfile?: ReturnType<typeof import('./journey-tracking.js').exportJourneyProfile>;
    valuesProfile?: ReturnType<typeof import('./values-coaching.js').exportValuesProfile>;
    progressProfile?: ReturnType<typeof import('./progress-metrics.js').exportProgressProfile>;
    seasonalProfile?: ReturnType<typeof import('./seasonal-awareness.js').exportSeasonalProfile>;
    engagementProfile?: ReturnType<typeof import('./reengagement.js').exportEngagementProfile>;
    teamExperience?: ReturnType<typeof import('./handoff-intelligence.js').exportTeamExperience>;
    teamContext?: ReturnType<typeof import('./cross-persona-context.js').exportTeamContext>;
}
/**
 * Export all coaching profiles for a user
 */
export declare function exportAllCoachingProfiles(userId: string): Promise<CoachingProfileBundle>;
/**
 * Import all coaching profiles for a user
 */
export declare function importAllCoachingProfiles(bundle: CoachingProfileBundle): Promise<void>;
/**
 * Save coaching profiles to Firestore
 */
export declare function saveCoachingProfilesToFirestore(userId: string): Promise<boolean>;
/**
 * Load coaching profiles from Firestore
 */
export declare function loadCoachingProfilesFromFirestore(userId: string): Promise<boolean>;
/**
 * Initialize coaching profiles at session start
 * Call this when a user session begins
 */
export declare function initializeCoachingForSession(userId: string): Promise<void>;
/**
 * Persist coaching profiles at session end
 * Call this when a user session ends
 */
export declare function persistCoachingForSession(userId: string): Promise<void>;
declare const _default: {
    exportAllCoachingProfiles: typeof exportAllCoachingProfiles;
    importAllCoachingProfiles: typeof importAllCoachingProfiles;
    saveCoachingProfilesToFirestore: typeof saveCoachingProfilesToFirestore;
    loadCoachingProfilesFromFirestore: typeof loadCoachingProfilesFromFirestore;
    initializeCoachingForSession: typeof initializeCoachingForSession;
    persistCoachingForSession: typeof persistCoachingForSession;
};
export default _default;
//# sourceMappingURL=persistence.d.ts.map