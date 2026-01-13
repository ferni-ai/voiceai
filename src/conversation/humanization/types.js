/**
 * Humanization Types
 *
 * Shared types for the advanced humanization subsystem.
 *
 * @module @ferni/humanization/types
 */
// ============================================================================
// DEFAULTS
// ============================================================================
/**
 * Default humanization configuration
 */
export const DEFAULT_HUMANIZATION_CONFIG = {
    selfCorrection: {
        enabled: true,
        baseProbability: 0.08,
        maxPerSession: 4,
        cooldownTurns: 8,
        minComfortLevel: 0.3,
        minTurnNumber: 3,
        complexityMultiplier: 1.5,
        emotionalMultiplier: 1.3,
    },
    disfluency: {
        enabled: true,
        baseProbability: 0.12,
        maxPerSession: 6,
        cooldownTurns: 4,
        minComfortLevel: 0.2,
        minTurnNumber: 1,
        enabledTypes: ['filled_pause', 'discourse_marker', 'false_start'],
        skipSimpleResponses: true,
    },
    phoneticMirroring: {
        enabled: true,
        baseProbability: 0.9, // High - if we detect patterns, mirror them
        maxPerSession: 100, // No real limit
        cooldownTurns: 0, // Always apply
        minComfortLevel: 0,
        minTurnNumber: 3,
        minSamples: 3,
        mirroringStrength: 0.7,
    },
    catchingYourself: {
        enabled: true,
        baseProbability: 0.15,
        maxPerSession: 3,
        cooldownTurns: 10,
        minComfortLevel: 0.4,
        minTurnNumber: 5,
        enabledTypes: [
            'talking_too_much',
            'circling_back',
            'checking_understanding',
            'energy_mismatch',
        ],
    },
};
//# sourceMappingURL=types.js.map