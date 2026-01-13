/**
 * Behavior Types
 *
 * Type definitions for the bidirectional behavior system.
 * This system enables both:
 * - System → LLM: Events that trigger behavioral responses
 * - LLM → System: Behavior functions that change HOW Ferni speaks
 *
 * @module BehaviorTypes
 */
/**
 * Default behavior state
 */
export const DEFAULT_BEHAVIOR_STATE = {
    currentMode: 'presence',
    currentPacing: {
        speed: 'normal',
        pauses: 'normal',
    },
    modeChangedAt: Date.now(),
    isProcessing: false,
    isHoldingSpace: false,
    modeHistory: [],
};
// ============================================================================
// SILENCE DURATIONS (in ms)
// ============================================================================
export const SILENCE_DURATIONS = {
    brief: 3000, // 3 seconds
    medium: 5000, // 5 seconds
    extended: 8000, // 8 seconds
};
// ============================================================================
// PACING MULTIPLIERS
// ============================================================================
export const PACING_MULTIPLIERS = {
    slower: 1.3, // 30% slower
    normal: 1.0,
    faster: 0.8, // 20% faster
};
export const PAUSE_MULTIPLIERS = {
    shorter: 0.6, // 40% shorter
    normal: 1.0,
    longer: 1.5, // 50% longer
};
//# sourceMappingURL=behavior-types.js.map