/**
 * Shared Real-Time Noticing System
 *
 * This is the "superhuman" part of ALL personas.
 * Real friends notice when something shifts. Great therapists catch
 * the pause, the change in tone, the thing left unsaid.
 *
 * We have access to signals humans can't process in real-time:
 * - Exact pause duration
 * - Speech rate changes
 * - Voice emotion vs. text emotion mismatch
 * - Topic deflection patterns
 * - Energy trajectory over conversation
 *
 * BETTER THAN HUMAN because:
 * - We ALWAYS notice (humans get distracted)
 * - We notice PRECISELY (humans estimate)
 * - We remember PERFECTLY (humans forget)
 * - We never judge (humans have reactions)
 *
 * Generalized from: personas/bundles/ferni/realtime-noticing.ts
 *
 * @module personas/shared/realtime-noticing
 */
export interface NoticingInput {
    sessionId: string;
    personaId: string;
    turnCount: number;
    currentTranscript: string;
    pauseBeforeMs: number;
    speechRateWPM?: number;
    voiceEmotion?: {
        primary: string;
        confidence: number;
        arousal?: number;
        valence?: number;
    };
    textEmotion?: {
        primary: string;
        intensity: number;
        distressLevel: number;
    };
    previousTurns?: Array<{
        userTranscript: string;
        speechRate?: number;
        pauseBefore?: number;
        voiceEmotion?: string;
        topics?: string[];
    }>;
    currentTopics?: string[];
}
export interface NoticingThresholds {
    shortPauseMs: number;
    longPauseMs: number;
    veryLongPauseMs: number;
    energyDropArousal: number;
    energyDropValence: number;
    energyRiseArousal: number;
    energyRiseValence: number;
    speechSlowdownRatio: number;
    speechSpeedupRatio: number;
    subtleSlowdownRatio: number;
    subtleSpeedupRatio: number;
    minVoiceConfidence: number;
    repeatedThemeCount: number;
    minTurnsBetweenNoticing: number;
    maxNoticingsPerSession: number;
    sensitivityMultiplier: number;
}
export interface NoticingResult {
    type: NoticingType;
    observation: string;
    acknowledgment: string;
    shouldAcknowledge: boolean;
    confidence: number;
    timing: 'immediate' | 'gentle_delay' | 'wait_for_opening';
    subtlety: 'whisper' | 'gentle' | 'direct';
    personaId: string;
}
export type NoticingType = 'significant_pause' | 'energy_drop' | 'energy_rise' | 'mismatch' | 'topic_deflection' | 'speech_rate_change' | 'repeated_theme' | 'unfinished_thought' | 'question_dodged' | 'protective_language' | 'breakthrough_moment';
/**
 * Detect if there's something worth noticing
 */
export declare function detectNoticing(input: NoticingInput): NoticingResult | null;
/**
 * Check if we should throttle noticing (don't over-notice)
 */
export declare function shouldThrottleNoticing(sessionId: string, turnCount: number, result: NoticingResult, personaId?: string): boolean;
/**
 * Record that we noticed something
 */
export declare function recordNoticing(sessionId: string, turnCount: number, type: NoticingType): void;
/**
 * Clear session noticing state
 */
export declare function clearNoticingState(sessionId: string): void;
export declare const sharedRealtimeNoticing: {
    detect: typeof detectNoticing;
    shouldThrottle: typeof shouldThrottleNoticing;
    record: typeof recordNoticing;
    clear: typeof clearNoticingState;
};
export default sharedRealtimeNoticing;
//# sourceMappingURL=realtime-noticing.d.ts.map