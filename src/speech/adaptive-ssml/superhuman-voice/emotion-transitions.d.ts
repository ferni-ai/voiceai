/**
 * Emotional Transition Bridges
 *
 * Bridging sounds/phrases for emotional transitions.
 * Prevents jarring shifts between emotions.
 *
 * @module speech/adaptive-ssml/superhuman-voice/emotion-transitions
 */
/**
 * Bridging sounds/phrases for emotional transitions.
 * Prevents jarring shifts between emotions.
 */
export declare const EMOTIONAL_TRANSITION_BRIDGES: Record<string, Record<string, string>>;
/**
 * Get a transition bridge between two emotions.
 */
export declare function getEmotionalTransitionBridge(fromEmotion: string | undefined, toEmotion: string | undefined): string | null;
//# sourceMappingURL=emotion-transitions.d.ts.map