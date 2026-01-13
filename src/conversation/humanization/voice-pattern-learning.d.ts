/**
 * Voice Pattern Learning
 *
 * Learns and persists user voice preferences across sessions:
 * - Preferred agent speaking pace (WPM)
 * - Comfortable turn gap duration
 * - Interruption style preferences
 * - Time-of-day patterns (morning energy vs late night calm)
 *
 * Uses exponential moving average for smooth adaptation and
 * Bayesian updates for boolean preferences.
 *
 * @module @ferni/humanization/voice-pattern-learning
 */
/**
 * Time of day bucket for pattern analysis
 */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'lateNight';
/**
 * Voice pattern observation from a single turn
 */
export interface VoiceObservation {
    /** User's words per minute */
    userWpm?: number;
    /** Agent's words per minute that user seemed comfortable with */
    agentWpm?: number;
    /** Gap between user stop and agent start (ms) */
    turnGapMs?: number;
    /** Did user interrupt the agent? */
    userInterrupted?: boolean;
    /** Did user seem to want more time before agent spoke? */
    wantedMoreGap?: boolean;
    /** User's energy level (0-1) */
    userEnergy?: number;
    /** Timestamp of observation */
    timestamp: number;
}
/**
 * Time-of-day specific patterns
 */
export interface TimeOfDayPattern {
    /** Average WPM preference for this time */
    preferredWpm: number;
    /** Average turn gap preference (ms) */
    preferredGapMs: number;
    /** Average energy level */
    avgEnergy: number;
    /** Number of observations */
    sampleCount: number;
}
/**
 * Persisted voice pattern data
 */
export interface VoicePatternData {
    /** User ID */
    userId: string;
    /** Overall preferred agent WPM */
    preferredAgentWpm: number;
    /** Overall preferred turn gap (ms) */
    preferredTurnGapMs: number;
    /** Does user frequently interrupt? (0-1 probability) */
    interruptionProbability: number;
    /** Does user prefer quick responses? */
    prefersQuickResponses: boolean;
    /** Time-of-day specific patterns */
    timeOfDayPatterns: Record<TimeOfDay, TimeOfDayPattern>;
    /** Total number of sessions */
    sessionCount: number;
    /** Total observations across all sessions */
    totalObservations: number;
    /** Confidence level (0-1) */
    confidence: number;
    /** Last updated timestamp */
    updatedAt: string;
    /** Schema version */
    version: number;
}
/**
 * Session-scoped voice pattern engine
 */
export interface VoicePatternEngine {
    sessionId: string;
    userId: string;
    observations: VoiceObservation[];
    sessionStartTime: number;
    persistedData: VoicePatternData | null;
}
export declare const VOICE_PATTERN_CONFIG: {
    /** Smoothing factor for EMA (higher = more weight on new observations) */
    EMA_ALPHA: number;
    /** Prior strength for Bayesian updates */
    BAYESIAN_PRIOR_STRENGTH: number;
    /** Minimum observations for reliable pattern */
    MIN_OBSERVATIONS: number;
    /** Maximum observations to store per session */
    MAX_SESSION_OBSERVATIONS: number;
    /** Default values */
    DEFAULTS: {
        agentWpm: number;
        turnGapMs: number;
        interruptionProbability: number;
    };
    /** Time-of-day hour boundaries */
    TIME_BUCKETS: {
        morning: {
            start: number;
            end: number;
        };
        afternoon: {
            start: number;
            end: number;
        };
        evening: {
            start: number;
            end: number;
        };
        lateNight: {
            start: number;
            end: number;
        };
    };
};
/**
 * Get or create voice pattern engine for a session
 */
export declare function getVoicePatternEngine(sessionId: string, userId: string, persistedData?: VoicePatternData): VoicePatternEngine;
/**
 * Reset voice pattern engine for a session
 */
export declare function resetVoicePatternEngine(sessionId: string): void;
/**
 * Get count of active engines
 */
export declare function getActiveVoicePatternEngineCount(): number;
/**
 * Get current time-of-day bucket
 */
export declare function getCurrentTimeOfDay(timestamp?: number): TimeOfDay;
/**
 * Record a voice observation for the session
 */
export declare function recordVoiceObservation(sessionId: string, observation: VoiceObservation): void;
/**
 * Get voice patterns for the current session
 */
export declare function getVoicePatterns(sessionId: string): VoicePatternData | null;
/**
 * Get recommended agent WPM for current context
 */
export declare function getRecommendedAgentWpm(sessionId: string): number;
/**
 * Get recommended turn gap for current context
 */
export declare function getRecommendedTurnGap(sessionId: string): number;
/**
 * Load voice patterns from Firestore
 */
export declare function loadVoicePatterns(userId: string): Promise<VoicePatternData | null>;
/**
 * Save voice patterns to Firestore
 */
export declare function saveVoicePatterns(patterns: VoicePatternData): Promise<boolean>;
/**
 * Initialize voice patterns at session start
 */
export declare function initializeVoicePatterns(sessionId: string, userId: string): Promise<VoicePatternData | null>;
/**
 * Persist voice patterns at session end
 */
export declare function persistVoicePatterns(sessionId: string): Promise<boolean>;
export declare const voicePatternLearning: {
    getEngine: typeof getVoicePatternEngine;
    resetEngine: typeof resetVoicePatternEngine;
    getActiveCount: typeof getActiveVoicePatternEngineCount;
    record: typeof recordVoiceObservation;
    getPatterns: typeof getVoicePatterns;
    getRecommendedWpm: typeof getRecommendedAgentWpm;
    getRecommendedGap: typeof getRecommendedTurnGap;
    initialize: typeof initializeVoicePatterns;
    persist: typeof persistVoicePatterns;
    load: typeof loadVoicePatterns;
    save: typeof saveVoicePatterns;
    getTimeOfDay: typeof getCurrentTimeOfDay;
    config: {
        /** Smoothing factor for EMA (higher = more weight on new observations) */
        EMA_ALPHA: number;
        /** Prior strength for Bayesian updates */
        BAYESIAN_PRIOR_STRENGTH: number;
        /** Minimum observations for reliable pattern */
        MIN_OBSERVATIONS: number;
        /** Maximum observations to store per session */
        MAX_SESSION_OBSERVATIONS: number;
        /** Default values */
        DEFAULTS: {
            agentWpm: number;
            turnGapMs: number;
            interruptionProbability: number;
        };
        /** Time-of-day hour boundaries */
        TIME_BUCKETS: {
            morning: {
                start: number;
                end: number;
            };
            afternoon: {
                start: number;
                end: number;
            };
            evening: {
                start: number;
                end: number;
            };
            lateNight: {
                start: number;
                end: number;
            };
        };
    };
};
//# sourceMappingURL=voice-pattern-learning.d.ts.map