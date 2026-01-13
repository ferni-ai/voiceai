/**
 * Music Transition Analytics
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Tracks which music transitions lead to better engagement. This data helps us:
 * 1. Understand which transition types work best in different contexts
 * 2. Improve the intelligent transition system over time
 * 3. A/B test new transition strategies
 * 4. Learn per-user preferences
 *
 * Engagement signals we track:
 * - Time until user speaks after transition (shorter = better?)
 * - User's emotional response (positive/negative/neutral)
 * - Whether user continued the topic vs. changed subjects
 * - Session continuation (did they stay engaged?)
 */
import type { TransitionType, TransitionResult } from './intelligent-music-transitions.js';
import type { MusicStartReason, MusicSessionContext } from './music-session-context.js';
/**
 * A single transition event for analytics
 */
export interface TransitionEvent {
    /** Unique event ID */
    eventId: string;
    /** Session ID for grouping */
    sessionId: string;
    /** User ID for per-user learning */
    userId: string;
    /** Persona that was active */
    personaId: string;
    /** Why music originally started */
    startReason: MusicStartReason;
    /** What type of transition we used */
    transitionType: TransitionType;
    /** Whether we spoke or stayed silent */
    didSpeak: boolean;
    /** The phrase used (if any) */
    phrase?: string;
    /** Confidence score of the transition decision */
    confidence: number;
    /** Context that influenced the decision */
    context: {
        emotionalTone?: 'heavy' | 'light' | 'neutral' | 'crisis';
        relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'close_friend';
        isLateNight: boolean;
        topicBeforeMusic?: string;
        wasUserMidThought?: boolean;
        musicDurationMs?: number;
    };
    /** Timestamp when transition occurred */
    timestamp: number;
    /** A/B test variant (if in experiment) */
    experimentVariant?: string;
}
/**
 * Engagement signals after a transition
 */
export interface EngagementSignals {
    /** Event ID this engagement is for */
    eventId: string;
    /** Time (ms) until user spoke after transition */
    timeToUserSpeechMs?: number;
    /** What the user said (first utterance) */
    firstUserUtterance?: string;
    /** Detected emotional response */
    emotionalResponse?: 'positive' | 'negative' | 'neutral';
    /** Did user continue the topic from before music? */
    continuedTopic?: boolean;
    /** Did user explicitly reference the music? */
    mentionedMusic?: boolean;
    /** Session duration after this transition */
    sessionContinuedMs?: number;
    /** User's voice tone (if available) */
    voiceTone?: 'warm' | 'neutral' | 'cold' | 'emotional';
}
/**
 * Aggregated analytics for a transition type
 */
export interface TransitionStats {
    /** Total times this transition type was used */
    count: number;
    /** Average time to user speech (ms) */
    avgTimeToSpeech: number;
    /** Percentage with positive emotional response */
    positiveResponseRate: number;
    /** Percentage where user continued the topic */
    topicContinuationRate: number;
    /** Average session continuation time (ms) */
    avgSessionContinuation: number;
    /** Breakdown by start reason */
    byStartReason: Record<MusicStartReason, {
        count: number;
        avgTimeToSpeech: number;
        positiveResponseRate: number;
    }>;
}
/**
 * A/B Test configuration
 */
export interface ABTestConfig {
    /** Test name */
    name: string;
    /** Is the test active? */
    active: boolean;
    /** Variants and their weights */
    variants: Array<{
        name: string;
        weight: number;
        config: Partial<TransitionOverrides>;
    }>;
    /** Start date */
    startedAt: number;
    /** Minimum sample size per variant */
    minSampleSize: number;
}
/**
 * Overrides for transition behavior (used in A/B tests)
 */
export interface TransitionOverrides {
    /** Force silence probability */
    silenceProbability?: number;
    /** Force specific transition type */
    forceTransitionType?: TransitionType;
    /** Override phrase selection */
    phraseStyle?: 'minimal' | 'standard' | 'warm';
}
/**
 * A/B Test analysis with statistical significance
 */
export interface ABTestAnalysis {
    /** Test name */
    testName: string;
    /** Per-variant stats */
    variants: Record<string, TransitionStats>;
    /** Is the difference statistically significant? (p < 0.05) */
    isSignificant: boolean;
    /** P-value from z-test for proportions */
    pValue: number | null;
    /** 95% confidence interval for the difference */
    confidenceInterval: {
        lower: number;
        upper: number;
    } | null;
    /** Human-readable recommendation */
    recommendation: string;
    /** Whether sample size is adequate for conclusions */
    sampleSizeAdequate: boolean;
    /** Minimum sample size per variant */
    minSampleSize: number;
    /** Detailed comparison (if 2+ variants) */
    comparison?: {
        controlName: string;
        treatmentName: string;
        controlRate: number;
        treatmentRate: number;
        controlCount: number;
        treatmentCount: number;
        absoluteDifference: number;
        relativeLift: number;
    };
}
/**
 * In-memory analytics store
 * In production, this would be backed by Firestore/BigQuery
 */
declare class TransitionAnalyticsStore {
    private events;
    private engagements;
    private userStats;
    private globalStats;
    private activeTests;
    private userAssignments;
    private recentEvents;
    private readonly MAX_RECENT_EVENTS;
    /**
     * Record a transition event
     */
    recordTransition(event: TransitionEvent): void;
    /**
     * Record engagement signals for a transition
     */
    recordEngagement(signals: EngagementSignals): void;
    /**
     * Update aggregated stats
     */
    private updateStats;
    /**
     * Update a stats map with new data
     */
    private updateStatsMap;
    /**
     * Create empty stats object
     */
    private createEmptyStats;
    /**
     * Get stats for a transition type
     */
    getStats(transitionType: TransitionType): TransitionStats | null;
    /**
     * Get stats for a user
     */
    getUserStats(userId: string, transitionType: TransitionType): TransitionStats | null;
    /**
     * Get all global stats
     */
    getAllStats(): Map<TransitionType, TransitionStats>;
    /**
     * Get recent events for analysis
     */
    getRecentEvents(count?: number): TransitionEvent[];
    /**
     * Register an A/B test
     */
    registerTest(config: ABTestConfig): void;
    /**
     * Get user's assigned variant for a test
     */
    getVariantAssignment(userId: string, testName: string): string | null;
    /**
     * Get variant config for a user/test
     */
    getVariantConfig(userId: string, testName: string): TransitionOverrides | null;
    /**
     * Get A/B test results
     */
    getTestResults(testName: string): Record<string, TransitionStats> | null;
    /**
     * Get A/B test results with statistical significance
     */
    getTestResultsWithSignificance(testName: string): ABTestAnalysis | null;
    /**
     * Export analytics data (for persistence)
     */
    export(): {
        events: TransitionEvent[];
        engagements: EngagementSignals[];
        globalStats: Record<TransitionType, TransitionStats>;
    };
    /**
     * Import analytics data (from persistence)
     */
    import(data: {
        events?: TransitionEvent[];
        engagements?: EngagementSignals[];
        globalStats?: Record<TransitionType, TransitionStats>;
    }): void;
    /**
     * Clear all data (for testing)
     */
    clear(): void;
}
/**
 * Get the analytics store (singleton)
 */
export declare function getTransitionAnalytics(): TransitionAnalyticsStore;
/**
 * Reset analytics (for testing)
 */
export declare function resetTransitionAnalytics(): void;
/**
 * Generate a unique event ID
 */
export declare function generateEventId(): string;
/**
 * Create a transition event from context
 */
export declare function createTransitionEvent(sessionId: string, userId: string, personaId: string, musicContext: MusicSessionContext | null, result: TransitionResult, experimentVariant?: string): TransitionEvent;
/**
 * Record a transition with analytics
 */
export declare function recordTransitionWithAnalytics(sessionId: string, userId: string, personaId: string, musicContext: MusicSessionContext | null, result: TransitionResult, experimentVariant?: string): string;
/**
 * Record engagement signals after transition
 */
export declare function recordEngagementSignals(eventId: string, signals: Omit<EngagementSignals, 'eventId'>): void;
/**
 * Get the best transition type for a context based on historical data
 */
export declare function getBestTransitionType(startReason: MusicStartReason, userId?: string): TransitionType | null;
/**
 * Load analytics from Firestore on startup
 */
export declare function loadAnalyticsFromFirestore(): Promise<void>;
/**
 * Persist analytics aggregates to Firestore
 * We only save aggregated stats, not individual events (too expensive)
 */
export declare function persistAnalyticsToFirestore(): Promise<void>;
/**
 * Start periodic analytics persistence (every 5 minutes)
 */
export declare function startAnalyticsPersistence(): void;
/**
 * Stop analytics persistence and flush final data
 */
export declare function stopAnalyticsPersistence(): Promise<void>;
declare const _default: {
    getTransitionAnalytics: typeof getTransitionAnalytics;
    resetTransitionAnalytics: typeof resetTransitionAnalytics;
    generateEventId: typeof generateEventId;
    createTransitionEvent: typeof createTransitionEvent;
    recordTransitionWithAnalytics: typeof recordTransitionWithAnalytics;
    recordEngagementSignals: typeof recordEngagementSignals;
    getBestTransitionType: typeof getBestTransitionType;
    loadAnalyticsFromFirestore: typeof loadAnalyticsFromFirestore;
    persistAnalyticsToFirestore: typeof persistAnalyticsToFirestore;
    startAnalyticsPersistence: typeof startAnalyticsPersistence;
    stopAnalyticsPersistence: typeof stopAnalyticsPersistence;
};
export default _default;
//# sourceMappingURL=music-transition-analytics.d.ts.map