/**
 * User Trigger Profile Types
 *
 * Phase 2: Personal Memory Integration
 *
 * These types define the personal context that makes triggers "Better than Human."
 * A good friend remembers your mom's name, the anniversary of your loss,
 * and the phrases you use when you're deflecting. Ferni should too.
 *
 * @module UserTriggerProfileTypes
 */
/**
 * Default anticipatory safeguards for new users
 */
export const DEFAULT_ANTICIPATION_SAFEGUARDS = {
    enabled: true, // Opt-in by default, but conservative
    minConfidenceThreshold: 0.7, // High confidence required
    minInputLength: 15, // At least 15 characters
    maxPerSession: 3, // Max 3 anticipations per session
    minSecondsBetween: 120, // At least 2 minutes between anticipations
    disabledTopics: [],
    disabledTimes: [],
};
/**
 * Default anticipatory intelligence for new users
 */
export const DEFAULT_ANTICIPATORY_INTELLIGENCE = {
    signals: [],
    voiceCues: [],
    recentEvents: [],
    safeguards: DEFAULT_ANTICIPATION_SAFEGUARDS,
    overallAccuracy: 0,
    minObservationsForSignal: 3,
    lastAnalyzedAt: new Date(),
};
/**
 * Default empty temporal intelligence for new users
 */
export const DEFAULT_TEMPORAL_INTELLIGENCE = {
    dayPatterns: [],
    timePatterns: [],
    datePatterns: [],
    recentFirings: [],
    lastAnalyzedAt: new Date(),
    minObservationsForPattern: 5,
    overallConfidence: 0,
};
/**
 * Default empty profile for new users
 */
export const DEFAULT_USER_TRIGGER_PROFILE = {
    schemaVersion: 3, // Bumped for Phase 5 anticipatory intelligence
    significantDates: [],
    relationships: [],
    communicationPatterns: {
        phrasePatterns: [],
        deflectionPhrases: [],
        vulnerabilitySignals: [],
        sensitiveTopics: [],
        temporalPatterns: [],
        communicationStyle: {
            directness: 'balanced',
            processingStyle: 'balanced',
            openingSpeed: 'moderate',
        },
    },
    triggerEffectiveness: [],
    temporalIntelligence: DEFAULT_TEMPORAL_INTELLIGENCE,
    anticipatoryIntelligence: DEFAULT_ANTICIPATORY_INTELLIGENCE,
    createdAt: new Date(),
    updatedAt: new Date(),
    conversationsAnalyzed: 0,
    profileConfidence: 0,
};
//# sourceMappingURL=user-trigger-profile.types.js.map