/**
 * Speech Humanization Types
 *
 * Shared types for the "Better Than Human" speech humanization system.
 * These types support persona-specific JSON behavior files and context-aware
 * selection of human speech patterns.
 *
 * @module speech/humanization/types
 */
/**
 * Default injection configs per persona energy style
 */
export const INJECTION_CONFIGS = {
    // High energy personas (Jordan)
    high_energy: {
        baseProbability: 0.25,
        turnMultiplier: 0.05,
        maxBehaviorsPerResponse: 2,
        minCharsBetweenInjections: 50,
        preferredCategories: [
            'excitement_overflow',
            'restarts',
            'natural_restarts',
            'thinking_aloud',
            'vocal_vulnerability',
        ],
        avoidCategories: [],
    },
    // Warm/encouraging personas (Maya, Ferni)
    warm: {
        baseProbability: 0.2,
        turnMultiplier: 0.04,
        maxBehaviorsPerResponse: 2,
        minCharsBetweenInjections: 60,
        preferredCategories: [
            'empathy_sounds',
            'genuine_processing',
            'celebration_overflow',
            'vocal_vulnerability',
            'natural_restarts',
            'warm_processing',
            'celebration_warmth',
        ],
        avoidCategories: [],
    },
    // Efficient personas (Alex)
    efficient: {
        baseProbability: 0.15,
        turnMultiplier: 0.03,
        maxBehaviorsPerResponse: 1,
        minCharsBetweenInjections: 80,
        preferredCategories: [
            'efficient_processing',
            'grounding_sounds',
            'natural_restarts',
            'vocal_vulnerability',
        ],
        avoidCategories: ['excitement_overflow', 'celebration_overflow'],
    },
    // Contemplative personas (Nayan)
    contemplative: {
        baseProbability: 0.2,
        turnMultiplier: 0.02,
        maxBehaviorsPerResponse: 2,
        minCharsBetweenInjections: 100,
        preferredCategories: [
            'contemplative_sounds',
            'wisdom_building',
            'presence_sounds',
            'vocal_vulnerability',
            'natural_restarts',
        ],
        avoidCategories: ['excitement_overflow', 'restarts'],
    },
    // Analytical personas (Peter)
    analytical: {
        baseProbability: 0.15,
        turnMultiplier: 0.03,
        maxBehaviorsPerResponse: 1,
        minCharsBetweenInjections: 70,
        preferredCategories: [
            'thinking_aloud',
            'self_corrections',
            'grandfatherly_processing',
            'vocal_vulnerability',
            'natural_restarts',
            'research_precision',
            'elderly_warmth',
        ],
        avoidCategories: ['excitement_overflow', 'empathy_sounds'],
    },
};
/**
 * Map persona IDs to their injection config style
 */
export const PERSONA_INJECTION_STYLE = {
    ferni: 'warm',
    'maya-santos': 'warm',
    'jordan-taylor': 'high_energy',
    'alex-chen': 'efficient',
    'nayan-patel': 'contemplative',
    'peter-john': 'analytical',
};
//# sourceMappingURL=types.js.map