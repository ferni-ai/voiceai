/**
 * Dynamic Speed Control
 *
 * Real-time speech speed adjustment based on:
 * - User engagement level (from listening pipeline)
 * - Content complexity (from cognitive load detector)
 * - Emotional intensity (from emotional arc)
 * - User's speaking patterns (WPM mirroring)
 *
 * This enables Ferni to naturally adapt speaking pace to match
 * the conversation's needs - slowing down for complex or emotional
 * content, speeding up when the user is highly engaged.
 *
 * @module dynamic-speed-control
 */
export interface SpeedControlContext {
    /** User engagement level 0-1 (from engagement scorer) */
    userEngagement: number;
    /** Content complexity 0-1 (from cognitive load detector) */
    contentComplexity: number;
    /** Emotional intensity 0-1 (from emotional arc arousal) */
    emotionalIntensity: number;
    /** Base speed multiplier (persona default) */
    baseSpeed: number;
    /** User's recent WPM (optional, for mirroring) */
    userWPM?: number;
    /** Topic weight */
    topicWeight?: 'light' | 'medium' | 'heavy';
    /** Turn number in conversation */
    turnNumber?: number;
}
export interface SpeedControlResult {
    /** Final speed multiplier (0.7-1.3 range) */
    speedMultiplier: number;
    /** Individual contribution factors */
    factors: {
        engagement: number;
        complexity: number;
        emotion: number;
        wpmMirroring: number;
        topicWeight: number;
    };
    /** Human-readable reason for the speed */
    reason: string;
    /** Should add extra pauses? */
    addExtraPauses: boolean;
    /** Recommended pause duration multiplier */
    pauseMultiplier: number;
}
export interface SpeedControlConfig {
    /** Minimum speed multiplier */
    minSpeed: number;
    /** Maximum speed multiplier */
    maxSpeed: number;
    /** How much engagement affects speed (0-1) */
    engagementWeight: number;
    /** How much complexity affects speed (0-1) */
    complexityWeight: number;
    /** How much emotion affects speed (0-1) */
    emotionWeight: number;
    /** How much user WPM mirroring affects speed (0-1) */
    wpmMirroringWeight: number;
    /** Target WPM for "normal" speaking pace */
    targetWPM: number;
}
export declare const DEFAULT_SPEED_CONFIG: SpeedControlConfig;
/**
 * Calculate dynamic speed adjustment based on conversation context
 *
 * @param context - Current conversation context
 * @param config - Speed control configuration
 * @returns Speed control result with multiplier and reasons
 *
 * @example
 * ```typescript
 * const speedResult = calculateDynamicSpeed({
 *   userEngagement: 0.8,      // Highly engaged
 *   contentComplexity: 0.3,   // Low complexity
 *   emotionalIntensity: 0.4,  // Moderate emotion
 *   baseSpeed: 1.0,
 *   userWPM: 140,
 *   topicWeight: 'medium',
 * });
 *
 * // speedResult.speedMultiplier might be 1.05 (slightly faster)
 * ```
 */
export declare function calculateDynamicSpeed(context: SpeedControlContext, config?: SpeedControlConfig): SpeedControlResult;
/**
 * Apply dynamic speed control to text as SSML
 *
 * @param text - The text to wrap with speed control
 * @param result - The speed control result
 * @returns SSML-wrapped text
 */
export declare function applyDynamicSpeedSsml(text: string, result: SpeedControlResult): string;
interface SpeedControlSession {
    sessionId: string;
    history: SpeedControlResult[];
    avgSpeed: number;
    turnCount: number;
}
/**
 * Get or create speed control session
 */
export declare function getSpeedControlSession(sessionId: string): SpeedControlSession;
/**
 * Record a speed control decision for trend analysis
 */
export declare function recordSpeedDecision(sessionId: string, result: SpeedControlResult): void;
/**
 * Get speed trend for a session
 */
export declare function getSpeedTrend(sessionId: string): {
    avgSpeed: number;
    trend: 'speeding_up' | 'slowing_down' | 'stable';
    turnCount: number;
};
/**
 * Reset speed control session
 */
export declare function resetSpeedControlSession(sessionId: string): void;
/**
 * Reset all sessions
 */
export declare function resetAllSpeedControlSessions(): void;
declare const _default: {
    calculateDynamicSpeed: typeof calculateDynamicSpeed;
    applyDynamicSpeedSsml: typeof applyDynamicSpeedSsml;
    getSpeedControlSession: typeof getSpeedControlSession;
    recordSpeedDecision: typeof recordSpeedDecision;
    getSpeedTrend: typeof getSpeedTrend;
    resetSpeedControlSession: typeof resetSpeedControlSession;
    resetAllSpeedControlSessions: typeof resetAllSpeedControlSessions;
    DEFAULT_SPEED_CONFIG: SpeedControlConfig;
};
export default _default;
//# sourceMappingURL=dynamic-speed-control.d.ts.map