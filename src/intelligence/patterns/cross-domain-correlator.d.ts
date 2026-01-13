/**
 * Cross-Domain Correlator - Unified Intelligence Level 4
 *
 * "Connects dots humans miss"
 *
 * Detects patterns across different life domains that humans
 * couldn't track themselves:
 *
 * - "Your sleep quality drops before big presentations"
 * - "You mention mom more when work stress is high"
 * - "Monday productivity correlates with Sunday sleep"
 *
 * This is a "Better Than Human" capability - no human friend
 * could consistently track these cross-domain patterns.
 *
 * @module intelligence/patterns/cross-domain-correlator
 */
/**
 * Domains we track for correlation
 */
export type CorrelationDomain = 'sleep' | 'energy' | 'mood' | 'stress' | 'productivity' | 'exercise' | 'social' | 'work' | 'family' | 'health' | 'habits' | 'time_of_day' | 'day_of_week' | 'weather' | 'person_mentioned' | 'topic_discussed' | 'calendar' | 'financial' | 'habit' | 'task' | 'milestone' | 'emotion' | 'wellness' | 'relationships';
/**
 * A signal from a specific domain
 */
export interface DomainSignal {
    domain: CorrelationDomain;
    store: string;
    metric: string;
    direction: 'increased' | 'decreased' | 'changed' | 'stable' | 'completed' | 'missed';
    magnitude: 'minor' | 'moderate' | 'significant';
    timestamp: Date;
    metadata?: Record<string, unknown>;
}
/**
 * A detected correlation between domains
 */
export interface CrossDomainCorrelation {
    id: string;
    userId: string;
    domainA: {
        domain: CorrelationDomain;
        pattern: string;
        direction?: string;
    };
    domainB: {
        domain: CorrelationDomain;
        pattern: string;
        direction?: string;
    };
    strength: number;
    confidence: 'suspected' | 'likely' | 'confirmed';
    observationCount: number;
    insight: string;
    suggestion?: string;
    firstObserved: Date;
    lastObserved: Date;
    surfaceStrategy: 'proactively' | 'when_relevant' | 'on_request';
    surfacedCount: number;
    lastSurfaced?: Date;
}
/**
 * Options for getting correlations
 */
export interface CorrelationFilterOptions {
    minConfidence?: 'suspected' | 'likely' | 'confirmed';
    domains?: CorrelationDomain[];
    limit?: number;
}
/**
 * Record a domain signal for correlation analysis.
 *
 * Call this whenever you observe a meaningful change in any domain:
 * - User mentions being tired → sleep domain
 * - Habit completed → habits domain
 * - Stress detected in voice → stress domain
 * - Person mentioned → person_mentioned domain
 */
export declare function recordDomainSignal(userId: string, signal: DomainSignal): void;
/**
 * Get correlations for a user.
 */
export declare function getCorrelations(userId: string, options?: CorrelationFilterOptions): CrossDomainCorrelation[];
/**
 * Get correlations relevant to current context.
 */
export declare function getRelevantCorrelations(userId: string, context: {
    currentTopics?: string[];
    currentMood?: string;
    currentDomains?: CorrelationDomain[];
}): CrossDomainCorrelation[];
/**
 * Mark a correlation as surfaced (shown to user).
 */
export declare function markCorrelationSurfaced(userId: string, correlationId: string): void;
/**
 * Format correlations for LLM context injection.
 */
export declare function formatCorrelationsForPrompt(correlations: CrossDomainCorrelation[]): string;
/**
 * Clear correlator state for a user.
 */
export declare function clearCorrelatorState(userId?: string): void;
/**
 * Get domain signals for debugging/testing.
 */
export declare function getDomainSignals(userId: string): DomainSignal[];
declare class CrossDomainCorrelatorSingleton {
    recordSignal: typeof recordDomainSignal;
    getCorrelations: typeof getCorrelations;
    getRelevant: typeof getRelevantCorrelations;
    markSurfaced: typeof markCorrelationSurfaced;
    format: typeof formatCorrelationsForPrompt;
    clear: typeof clearCorrelatorState;
    getSignals: typeof getDomainSignals;
}
export declare function getCrossCorrelator(): CrossDomainCorrelatorSingleton;
export declare const crossDomainCorrelator: CrossDomainCorrelatorSingleton;
export {};
//# sourceMappingURL=cross-domain-correlator.d.ts.map