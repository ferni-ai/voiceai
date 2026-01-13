/**
 * Human Listening Memory
 *
 * Cross-session learning for personalized listening baselines.
 * Instead of comparing to population averages, we learn each user's
 * natural patterns and detect deviations from THEIR normal.
 *
 * This enables "better than human" insights like:
 * - "You usually speak fluently, but today you're hesitating a lot"
 * - "You don't normally use self-soothing phrases"
 * - "Your filler rate is 3x higher than usual"
 *
 * PERSISTENCE: Uses Firestore for cross-session baselines with in-memory caching.
 *
 * @module HumanListeningMemory
 */
export interface UserListeningBaseline {
    /** User ID */
    userId: string;
    /** Last update timestamp */
    updatedAt: number;
    /** Number of sessions used to build baseline */
    sessionCount: number;
    /** Filler word patterns */
    fillers: {
        /** Normal filler rate per 100 words */
        normalRate: number;
        /** Most common filler type */
        preferredFiller: string;
        /** Variance in filler rate */
        variance: number;
    };
    /** Cognitive load patterns */
    cognitiveLoad: {
        /** Baseline speech rate (WPM) */
        normalSpeechRate: number;
        /** Normal pause frequency */
        normalPauseRate: number;
        /** Normal repetition rate */
        normalRepetitionRate: number;
    };
    /** Hedging patterns */
    hedging: {
        /** Baseline hedging density */
        normalDensity: number;
        /** Typical categories they use */
        typicalCategories: string[];
    };
    /** Self-soothing patterns */
    selfSoothing: {
        /** How often they use self-soothing language (rare = more significant when detected) */
        frequency: 'rare' | 'occasional' | 'frequent';
        /** Typical phrases they use */
        typicalPhrases: string[];
    };
    /** Engagement patterns */
    engagement: {
        /** Normal response latency (ms) */
        normalLatency: number;
        /** Normal response length (chars) */
        normalLength: number;
        /** Question rate per conversation */
        questionRate: number;
    };
    /** Voice characteristics (if audio available) */
    voice?: {
        /** Baseline energy level */
        normalEnergy: number;
        /** Typical pitch variance */
        pitchVariance: number;
        /** Baseline speaking rate (syllables/sec) */
        speakingRate: number;
    };
}
export interface SessionObservations {
    /** Observations from current session */
    fillerRate: number;
    fillerTypes: Record<string, number>;
    speechRate: number;
    pauseRate: number;
    hedgingDensity: number;
    hedgingCategories: string[];
    selfSoothingCount: number;
    selfSoothingPhrases: string[];
    responseLatencies: number[];
    responseLengths: number[];
    questionCount: number;
    turnCount: number;
}
export interface DeviationReport {
    /** Is there a significant deviation from baseline? */
    hasDeviation: boolean;
    /** Confidence in the deviation detection (0-1) */
    confidence: number;
    /** Specific deviations found */
    deviations: Array<{
        aspect: string;
        description: string;
        severity: 'notable' | 'significant' | 'major';
        baselineValue: number | string;
        currentValue: number | string;
        percentChange?: number;
    }>;
    /** Suggested agent response */
    guidance: string;
}
/**
 * Get a user's listening baseline (from cache)
 */
export declare function getUserBaseline(userId: string): UserListeningBaseline | null;
/**
 * Load baseline from Firestore with in-memory caching
 */
export declare function loadUserBaseline(userId: string): Promise<UserListeningBaseline | null>;
/**
 * Save baseline to Firestore with in-memory cache update
 */
export declare function saveUserBaseline(baseline: UserListeningBaseline): Promise<void>;
/**
 * Create initial baseline with defaults
 */
export declare function createInitialBaseline(userId: string): UserListeningBaseline;
/**
 * Initialize session observation tracking
 */
export declare function initSessionObservations(sessionId: string): void;
/**
 * Record observations from a single turn
 */
export declare function recordTurnObservations(sessionId: string, observations: Partial<{
    fillerRate: number;
    fillerTypes: Record<string, number>;
    speechRate: number;
    hedgingDensity: number;
    hedgingCategories: string[];
    selfSoothingDetected: boolean;
    selfSoothingPhrases: string[];
    responseLatency: number;
    responseLength: number;
    askedQuestion: boolean;
}>): void;
/**
 * Get current session observations
 */
export declare function getSessionObservations(sessionId: string): SessionObservations | null;
/**
 * Compare current session to user's baseline and detect deviations
 */
export declare function detectDeviations(userId: string, sessionId: string): DeviationReport;
/**
 * Update user's baseline with session observations
 * Called at end of session to evolve the baseline
 */
export declare function updateBaselineFromSession(userId: string, sessionId: string): Promise<void>;
/**
 * Clean up session observations
 */
export declare function cleanupSessionObservations(sessionId: string): void;
/**
 * Delete user baseline (for GDPR compliance)
 */
export declare function deleteUserBaseline(userId: string): Promise<void>;
/**
 * Load baselines for multiple users (for batch operations)
 */
export declare function loadBaselinesForUsers(userIds: string[]): Promise<Map<string, UserListeningBaseline>>;
/**
 * Get all users with baselines (for analytics/admin)
 */
export declare function getAllBaselineUserIds(limit?: number): Promise<string[]>;
/**
 * Clear in-memory cache (useful for testing)
 */
export declare function clearCache(): void;
declare const _default: {
    getUserBaseline: typeof getUserBaseline;
    loadUserBaseline: typeof loadUserBaseline;
    saveUserBaseline: typeof saveUserBaseline;
    createInitialBaseline: typeof createInitialBaseline;
    initSessionObservations: typeof initSessionObservations;
    recordTurnObservations: typeof recordTurnObservations;
    getSessionObservations: typeof getSessionObservations;
    detectDeviations: typeof detectDeviations;
    updateBaselineFromSession: typeof updateBaselineFromSession;
    cleanupSessionObservations: typeof cleanupSessionObservations;
    deleteUserBaseline: typeof deleteUserBaseline;
    loadBaselinesForUsers: typeof loadBaselinesForUsers;
    getAllBaselineUserIds: typeof getAllBaselineUserIds;
    clearCache: typeof clearCache;
};
export default _default;
//# sourceMappingURL=human-listening-memory.d.ts.map