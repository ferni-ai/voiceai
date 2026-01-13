/**
 * Emotional Transition Bridges
 *
 * Bridging sounds/phrases for emotional transitions.
 * Prevents jarring shifts between emotions.
 *
 * @module speech/adaptive-ssml/superhuman-voice/emotion-transitions
 */
// ============================================================================
// CONFIGURATION
// ============================================================================
/**
 * Bridging sounds/phrases for emotional transitions.
 * Prevents jarring shifts between emotions.
 */
export const EMOTIONAL_TRANSITION_BRIDGES = {
    // From sympathetic to...
    sympathetic: {
        curious: '<break time="200ms"/><speed ratio="0.9"/>But you know...<break time="150ms"/>',
        happy: '<break time="250ms"/><speed ratio="0.92"/>And...<break time="150ms"/>',
        excited: '<break time="200ms"/>But here\'s the thing—<break time="100ms"/>',
        affectionate: '<break time="150ms"/>',
    },
    // From happy to...
    happy: {
        sympathetic: '<break time="200ms"/><speed ratio="0.88"/>Though...<break time="200ms"/>',
        curious: '<break time="100ms"/>And—<break time="100ms"/>',
        affectionate: '<break time="150ms"/>',
    },
    // From excited to...
    excited: {
        sympathetic: '<break time="250ms"/><speed ratio="0.85"/>That said...<break time="200ms"/>',
        calm: '<break time="200ms"/><speed ratio="0.9"/>Okay, so...<break time="150ms"/>',
        curious: '<break time="100ms"/>',
    },
    // From calm to...
    calm: {
        excited: '<break time="150ms"/>Oh!<break time="100ms"/>',
        sympathetic: '<break time="200ms"/>',
        affectionate: '<break time="150ms"/>',
    },
    // From curious to...
    curious: {
        sympathetic: '<break time="200ms"/><speed ratio="0.9"/>Mm.<break time="150ms"/>',
        excited: '<break time="100ms"/>Oh!<break time="100ms"/>',
        affectionate: '<break time="150ms"/>',
    },
};
// ============================================================================
// MAIN FUNCTION
// ============================================================================
/**
 * Get a transition bridge between two emotions.
 */
export function getEmotionalTransitionBridge(fromEmotion, toEmotion) {
    if (!fromEmotion || !toEmotion)
        return null;
    if (fromEmotion === toEmotion)
        return null;
    const fromBridges = EMOTIONAL_TRANSITION_BRIDGES[fromEmotion];
    if (!fromBridges)
        return null;
    return fromBridges[toEmotion] || null;
}
//# sourceMappingURL=emotion-transitions.js.map