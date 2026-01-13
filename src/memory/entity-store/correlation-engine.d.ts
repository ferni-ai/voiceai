/**
 * Cross-Domain Correlation Engine
 *
 * This is Ferni's superhuman pattern recognition system.
 * Humans can sometimes notice patterns across domains, but they:
 * - Forget the data points that led to the insight
 * - Can't do statistical analysis across months of data
 * - Miss subtle correlations
 * - Can't track emotional valence over time
 *
 * Ferni can say: "I've noticed that when you talk about your mom,
 * it's usually after stressful work days. Is there a connection there?"
 *
 * This module detects:
 * - Temporal patterns (X usually happens at Y time)
 * - Emotional patterns (topic X correlates with emotion Y)
 * - Social patterns (person X is mentioned with topic Y)
 * - Behavioral patterns (action X leads to feeling Y)
 * - Cyclical patterns (weekly/monthly/seasonal)
 * - Causal patterns (X causes Y)
 *
 * @module memory/entity-store/correlation-engine
 */
export type CorrelationType = 'temporal' | 'emotional' | 'behavioral' | 'topical' | 'social' | 'causal' | 'cyclical';
/**
 * A detected correlation between entities or patterns.
 * This enables "Better Than Human" pattern recognition.
 */
export interface Correlation {
    /** Unique identifier */
    id: string;
    /** User ID */
    userId: string;
    /** Type of correlation */
    type: CorrelationType;
    /** Entity IDs involved */
    entityIds: string[];
    /** Description of the correlation */
    description: string;
    /** Statistical strength (0-1) */
    strength: number;
    /** Number of observations supporting this */
    observationCount: number;
    /** Confidence in this correlation */
    confidence: number;
    /** Is this a causal relationship or just correlation? */
    causal: boolean;
    /** Pattern details */
    pattern?: {
        temporal?: string;
        contextual?: string;
        behavioral?: string;
    };
    /** When this correlation was first detected */
    firstDetected: Date;
    /** When this correlation was last observed */
    lastObserved: Date;
    /** Metadata */
    createdAt: Date;
    updatedAt: Date;
}
/**
 * An observation that might contribute to a correlation
 */
export interface CorrelationObservation {
    id: string;
    userId: string;
    timestamp: Date;
    entityIds: string[];
    context: {
        emotion?: string;
        emotionIntensity?: number;
        topic?: string;
        timeOfDay?: string;
        dayOfWeek?: string;
        isWeekend?: boolean;
    };
    eventType: string;
}
export declare class CorrelationEngine {
    private db;
    private initialized;
    private observationBuffer;
    private flushTimeout;
    initialize(): Promise<void>;
    private ensureInitialized;
    /**
     * Record an observation that might contribute to a correlation.
     * Call this whenever something notable happens (entity mention, emotion, etc.)
     */
    recordObservation(userId: string, observation: Omit<CorrelationObservation, 'id' | 'userId' | 'timestamp'>): Promise<void>;
    /**
     * Analyze recent observations for patterns and correlations.
     */
    analyzePatterns(userId: string): Promise<Correlation[]>;
    /**
     * Get all detected correlations for a user
     */
    getCorrelations(userId: string, options?: {
        types?: CorrelationType[];
        entityIds?: string[];
        minStrength?: number;
        limit?: number;
    }): Promise<Correlation[]>;
    /**
     * Generate a natural language description of a correlation.
     */
    generateDescription(correlation: Correlation, entityNames: Map<string, string>): string;
    private detectTemporalPatterns;
    private detectEmotionalPatterns;
    private detectSocialPatterns;
    private detectCyclicalPatterns;
    private createCorrelation;
    private analyzeAndFlush;
    private loadRecentObservations;
    private saveCorrelation;
    private findExistingCorrelation;
    private docToCorrelation;
}
export declare function getCorrelationEngine(): CorrelationEngine;
export default CorrelationEngine;
//# sourceMappingURL=correlation-engine.d.ts.map