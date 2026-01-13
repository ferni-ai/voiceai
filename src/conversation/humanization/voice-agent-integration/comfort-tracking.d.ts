/**
 * Voice Agent Integration - Comfort & Phase Tracking
 *
 * @module @ferni/humanization/voice-agent-integration/comfort-tracking
 */
/**
 * Record a comfort-building event
 */
export declare function recordComfortEvent(sessionId: string, event: 'user_shared_vulnerability' | 'shared_laughter' | 'accepted_feedback' | 'emotional_moment_navigated' | 'user_initiated_deeper_topic' | 'comfortable_silence' | 'deep_disclosure' | 'reciprocated_vulnerability'): void;
/**
 * Get current conversation phase
 */
export declare function getConversationPhase(sessionId: string): string;
/**
 * Get phase-specific behavior guidance
 */
export declare function getPhaseBehavior(sessionId: string): import("../session-dynamics.js").PhaseBehavior | null;
/**
 * Check if a behavior is unlocked at current comfort level
 */
export declare function isBehaviorUnlocked(sessionId: string, behaviorName: string): boolean;
//# sourceMappingURL=comfort-tracking.d.ts.map