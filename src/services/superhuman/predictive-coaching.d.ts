/**
 * Predictive Coaching Engine - Better Than Human Service
 *
 * What no human friend can do: See your struggle before you do.
 *
 * SEMANTIC NOTE: Called "coaching" because it COACHES through prediction.
 * The service anticipates struggles and surfaces insights at optimal moments -
 * this is coaching behavior (proactive guidance), even though the mechanism
 * is pattern recognition. Compare to a coach who studies your game film and
 * predicts where you'll struggle before practice.
 *
 * Alternative names considered:
 * - predictive-patterns.ts (describes mechanism, not purpose)
 * - anticipatory-support.ts (too abstract)
 * - predictive-coaching.ts (describes PURPOSE - coaching through prediction) ✓
 *
 * ---
 *
 * Analyzes patterns across conversations to anticipate user needs
 * and proactively offer support before they ask.
 *
 * SCALING:
 * - Redis caching for cross-instance pattern sharing
 * - In-memory cache with LRU eviction for high-frequency access
 * - Async event emission for background worker processing
 *
 * @module services/superhuman/predictive-coaching
 */
/**
 * Initialize Redis caching for cross-instance pattern sharing.
 * Falls back to memory-only if Redis unavailable.
 */
export declare function initializeRedisCache(): Promise<void>;
export type PatternType = 'temporal' | 'emotional' | 'behavioral' | 'relational' | 'cyclical';
export type PredictionConfidence = 'low' | 'medium' | 'high' | 'very_high';
export interface PatternObservation {
    id: string;
    userId: string;
    type: PatternType;
    trigger: string;
    outcome: string;
    frequency: number;
    dayOfWeek?: number[];
    hourRange?: {
        start: number;
        end: number;
    };
    seasonalMonths?: number[];
    typicalEmotionBefore?: string;
    typicalEmotionAfter?: string;
    observationCount: number;
    lastObserved: number;
    firstObserved: number;
    confidence: PredictionConfidence;
}
export interface Prediction {
    id: string;
    userId: string;
    patternId: string;
    prediction: string;
    confidence: PredictionConfidence;
    basedOn: string;
    predictedFor: number;
    windowHours: number;
    suggestedIntervention: string;
    interventionTone: 'proactive' | 'gentle' | 'supportive' | 'protective';
    status: 'pending' | 'surfaced' | 'confirmed' | 'missed' | 'wrong';
    createdAt: number;
}
export interface DayPattern {
    dayOfWeek: number;
    patterns: Array<{
        description: string;
        frequency: number;
        avgEmotion: string;
    }>;
}
export interface PredictiveContext {
    upcomingChallenges: string[];
    suggestedInterventions: string[];
    patternsDetected: string[];
    confidenceLevel: PredictionConfidence;
}
export declare function recordObservation(userId: string, observation: {
    type: PatternType;
    trigger: string;
    outcome: string;
    emotion?: string;
    dayOfWeek?: number;
    hour?: number;
}): Promise<void>;
/**
 * Load patterns for a user with multi-tier caching:
 * 1. LRU memory cache (fastest, per-instance)
 * 2. Redis cache (fast, cross-instance)
 * 3. Firestore (source of truth)
 */
export declare function loadUserPatterns(userId: string): Promise<PatternObservation[]>;
/**
 * Apply confidence decay to patterns that haven't been observed recently.
 * This prevents stale patterns from dominating predictions.
 */
export declare function applyConfidenceDecay(pattern: PatternObservation): PatternObservation;
/**
 * Apply decay to all patterns and save updated confidence levels
 */
export declare function decayStalePatterns(userId: string): Promise<number>;
/**
 * Confirm a prediction was accurate - boosts pattern confidence
 */
export declare function confirmPrediction(userId: string, patternId: string): Promise<void>;
/**
 * Invalidate a prediction - reduces pattern confidence
 */
export declare function invalidatePrediction(userId: string, patternId: string): Promise<void>;
export declare function generatePredictions(userId: string): Promise<Prediction[]>;
export declare function getDayPatterns(userId: string): Promise<DayPattern[]>;
export declare function buildPredictiveContext(userId: string): Promise<PredictiveContext>;
export declare function buildPredictiveContextString(userId: string): Promise<string>;
/**
 * Clear pattern cache for a user (useful after bulk imports or testing).
 * Clears both memory and Redis caches.
 */
export declare function clearPatternCache(userId?: string): Promise<void>;
/**
 * Get cache statistics for debugging
 */
export declare function getCacheStats(): {
    memoryCacheUsers: number;
    redisEnabled: boolean;
    maxMemoryCacheSize: number;
};
export declare const predictiveCoaching: {
    recordObservation: typeof recordObservation;
    loadPatterns: typeof loadUserPatterns;
    generatePredictions: typeof generatePredictions;
    getDayPatterns: typeof getDayPatterns;
    buildContext: typeof buildPredictiveContext;
    buildContextString: typeof buildPredictiveContextString;
    clearCache: typeof clearPatternCache;
    getCacheStats: typeof getCacheStats;
    initializeRedis: typeof initializeRedisCache;
    confirmPrediction: typeof confirmPrediction;
    invalidatePrediction: typeof invalidatePrediction;
    applyConfidenceDecay: typeof applyConfidenceDecay;
    decayStalePatterns: typeof decayStalePatterns;
    recordPattern: typeof recordObservation;
    getPatterns: typeof loadUserPatterns;
};
//# sourceMappingURL=predictive-coaching.d.ts.map