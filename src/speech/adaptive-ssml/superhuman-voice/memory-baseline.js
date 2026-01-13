/**
 * Memory-Informed Baseline Tonality
 *
 * Baseline adjustments based on what we know about the user.
 * If we know they're going through something, adjust from the start.
 *
 * @module speech/adaptive-ssml/superhuman-voice/memory-baseline
 */
// ============================================================================
// CONFIGURATION
// ============================================================================
/**
 * Baseline adjustments based on what we know about the user.
 * If we know they're going through something, adjust from the start.
 */
export const MEMORY_INFORMED_ADJUSTMENTS = {
    grieving: {
        baseSpeedAdjust: -0.12,
        baseVolumeAdjust: -0.1,
        basePauseMultiplier: 1.3,
        defaultEmotion: 'sympathetic',
        openingStyle: 'gentle',
    },
    stressed: {
        baseSpeedAdjust: -0.05,
        baseVolumeAdjust: -0.05,
        basePauseMultiplier: 1.15,
        defaultEmotion: 'calm',
        openingStyle: 'supportive',
    },
    celebrating: {
        baseSpeedAdjust: 0.05,
        baseVolumeAdjust: 0.05,
        basePauseMultiplier: 0.9,
        defaultEmotion: 'happy',
        openingStyle: 'energetic',
    },
    struggling: {
        baseSpeedAdjust: -0.08,
        baseVolumeAdjust: -0.05,
        basePauseMultiplier: 1.2,
        defaultEmotion: 'affectionate',
        openingStyle: 'supportive',
    },
    growing: {
        baseSpeedAdjust: 0,
        baseVolumeAdjust: 0,
        basePauseMultiplier: 1.0,
        defaultEmotion: 'curious',
        openingStyle: 'warm',
    },
};
// ============================================================================
// MAIN FUNCTION
// ============================================================================
/**
 * Get baseline adjustments from known user context.
 */
export function getMemoryInformedBaseline(knownContext) {
    if (!knownContext)
        return null;
    return MEMORY_INFORMED_ADJUSTMENTS[knownContext];
}
//# sourceMappingURL=memory-baseline.js.map