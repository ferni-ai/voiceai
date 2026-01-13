/**
 * Predictive Cache Warming
 *
 * Predicts what the user will ask and pre-warms memory caches.
 * Uses session signals (time of day, day of week, persona handoffs)
 * to anticipate queries and fetch data before it's needed.
 *
 * Part of "Better than Human" - responding before the user even asks.
 *
 * Target: 80%+ cache hit rate for anticipated queries.
 *
 * @module memory/predictive-cache-warming
 */
export type PersonaId = 'ferni' | 'peter-john' | 'alex-chen' | 'maya-santos' | 'jordan-taylor' | 'nayan-patel';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export interface SessionSignals {
    /** Current time of day */
    timeOfDay: TimeOfDay;
    /** Current day of week */
    dayOfWeek: DayOfWeek;
    /** Current active persona */
    currentPersona: PersonaId;
    /** Previous persona (for handoff detection) */
    previousPersona?: PersonaId;
    /** Topics mentioned in recent conversation */
    recentTopics?: string[];
    /** Whether user is returning (had previous sessions) */
    isReturningUser?: boolean;
}
export interface PredictedQuery {
    /** The query to pre-warm */
    query: string;
    /** Category of data to fetch */
    category: 'calendar' | 'contacts' | 'health' | 'finance' | 'habits' | 'general';
    /** Confidence score (0-1) */
    confidence: number;
    /** Reason for prediction */
    reason: string;
}
export interface WarmingResult {
    /** Number of queries pre-warmed */
    warmedCount: number;
    /** Queries that were warmed */
    queries: string[];
    /** Duration in ms */
    durationMs: number;
}
export interface PredictiveCacheConfig {
    /** Minimum confidence threshold for warming (0-1) */
    confidenceThreshold: number;
    /** Maximum queries to pre-warm per session start */
    maxQueriesPerSession: number;
    /** Whether to warm in parallel or sequential */
    parallelWarming: boolean;
    /** Enable verbose logging */
    debug: boolean;
}
/**
 * Memory retrieval function signature.
 * Injected via dependency injection to avoid architecture violations.
 */
export type MemoryRetrievalFn = (userId: string, query: string) => Promise<unknown>;
/**
 * Configure predictive cache warming settings.
 */
export declare function configurePredictiveWarming(options: Partial<PredictiveCacheConfig>): void;
/**
 * Inject memory retrieval function.
 * Required before warming can be performed.
 * Called from services layer to avoid architecture violations.
 */
export declare function configureMemoryRetrieval(fn: MemoryRetrievalFn): void;
/**
 * Detect current time signals (time of day, day of week).
 */
export declare function detectTimeSignals(): {
    timeOfDay: TimeOfDay;
    dayOfWeek: DayOfWeek;
};
/**
 * Predict queries based on session signals.
 * Returns queries sorted by confidence (highest first).
 */
export declare function predictQueries(signals: SessionSignals): PredictedQuery[];
/**
 * Pre-warm the cache for a session.
 * Call this on session start after authentication.
 *
 * @param userId - User ID for cache scoping
 * @param signals - Session signals for prediction
 * @returns Warming result with count and duration
 */
export declare function warmCacheForSession(userId: string, signals: SessionSignals): Promise<WarmingResult>;
/**
 * Warm cache for a handoff event.
 * Call when persona changes to pre-warm for new persona's expected queries.
 *
 * @param userId - User ID
 * @param fromPersona - Persona being switched from
 * @param toPersona - Persona being switched to
 */
export declare function warmCacheForHandoff(userId: string, fromPersona: PersonaId, toPersona: PersonaId): Promise<WarmingResult>;
export declare const setupMemoryFetcher: typeof configureMemoryRetrieval;
declare const _default: {
    configurePredictiveWarming: typeof configurePredictiveWarming;
    configureMemoryRetrieval: typeof configureMemoryRetrieval;
    setupMemoryFetcher: typeof configureMemoryRetrieval;
    detectTimeSignals: typeof detectTimeSignals;
    predictQueries: typeof predictQueries;
    warmCacheForSession: typeof warmCacheForSession;
    warmCacheForHandoff: typeof warmCacheForHandoff;
};
export default _default;
//# sourceMappingURL=predictive-cache-warming.d.ts.map