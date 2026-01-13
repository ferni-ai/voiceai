/**
 * Advanced Humanization Types
 *
 * Type definitions for the voice humanization system.
 *
 * @module advanced-humanization/types
 */
// ============================================================================
// CARTESIA EMOTIONS
// ============================================================================
/**
 * Cartesia Sonic-3 supported emotions organized by category
 */
export const CARTESIA_EMOTIONS = {
    // Positive emotions
    positive: [
        'happy',
        'excited',
        'enthusiastic',
        'elated',
        'euphoric',
        'triumphant',
        'content',
        'peaceful',
        'serene',
        'calm',
        'grateful',
        'affectionate',
        'trust',
        'sympathetic',
        'flirtatious',
    ],
    // Engagement emotions
    engagement: [
        'curious',
        'amazed',
        'surprised',
        'anticipation',
        'mysterious',
        'joking',
        'comedic',
        'sarcastic',
        'ironic',
    ],
    // Negative emotions
    negative: [
        'sad',
        'dejected',
        'melancholic',
        'disappointed',
        'hurt',
        'angry',
        'mad',
        'outraged',
        'frustrated',
        'agitated',
        'threatened',
        'scared',
        'disgusted',
        'contempt',
        'envious',
    ],
    // Nuanced states
    nuanced: [
        'hesitant',
        'insecure',
        'confused',
        'resigned',
        'guilty',
        'bored',
        'tired',
        'rejected',
        'nostalgic',
        'wistful',
        'apologetic',
    ],
};
/**
 * All Cartesia emotions flattened into a single array
 */
export const ALL_CARTESIA_EMOTIONS = [
    ...CARTESIA_EMOTIONS.positive,
    ...CARTESIA_EMOTIONS.engagement,
    ...CARTESIA_EMOTIONS.negative,
    ...CARTESIA_EMOTIONS.nuanced,
];
/**
 * Default filler configuration
 */
export const DEFAULT_FILLER_CONFIG = {
    probability: 0.12, // 12% chance at injection points
    maxPerResponse: 2,
};
/**
 * Default breath group configuration
 */
export const DEFAULT_BREATH_CONFIG = {
    shortPause: 120,
    mediumPause: 220,
    longPause: 350,
    enabled: true,
};
/**
 * Default humanization options
 */
export const DEFAULT_HUMANIZATION_OPTIONS = {
    fillers: true,
    breathGroups: true,
    rhythmVariation: true,
    emotionMapping: true,
};
//# sourceMappingURL=types.js.map