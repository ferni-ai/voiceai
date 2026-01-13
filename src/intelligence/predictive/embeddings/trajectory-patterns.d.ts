/**
 * Trajectory Pattern Library - Embedding-Powered
 *
 * Embeds past emotional trajectories to match current patterns against
 * historical precedent.
 *
 * Example: "Last time you had similar signals, anxiety spike happened within 3 days."
 *
 * This enables learning from the user's own history to predict their future.
 *
 * @module intelligence/predictive/embeddings/trajectory-patterns
 */
import type { EmotionalTrajectory, PrecursorSignal } from '../pre-trajectory-detection.js';
export interface TrajectoryPattern {
    id: string;
    userId: string;
    trajectory: EmotionalTrajectory;
    severity: number;
    duration: number;
    trajectoryEmbedding: number[];
    precursorEmbedding: number[];
    contextEmbedding: number[];
    precursorSignals: Array<{
        signal: PrecursorSignal;
        value: number;
        daysBeforeOnset: number;
    }>;
    contextDescription: string;
    lifeDomains: string[];
    recordedAt: number;
    onsetAt: number;
    resolvedAt?: number;
    resolution: 'natural' | 'intervention' | 'escalation' | 'ongoing';
    helpfulInterventions?: string[];
}
export interface PatternMatch {
    pattern: TrajectoryPattern;
    overallSimilarity: number;
    precursorSimilarity: number;
    contextSimilarity: number;
    confidence: number;
    implication: string;
}
export interface TrajectoryPrediction {
    likelyTrajectory: EmotionalTrajectory;
    probability: number;
    expectedOnset: string;
    expectedSeverity: number;
    basedOn: PatternMatch[];
    preventiveActions: string[];
}
export interface CurrentSignalState {
    signals: Array<{
        signal: PrecursorSignal;
        value: number;
    }>;
    contextDescription: string;
    lifeDomains: string[];
    emotionalState: string;
}
/**
 * Record a trajectory pattern after it completes
 */
export declare function recordTrajectoryPattern(userId: string, pattern: Omit<TrajectoryPattern, 'id' | 'trajectoryEmbedding' | 'precursorEmbedding' | 'contextEmbedding'>): Promise<TrajectoryPattern>;
/**
 * Find similar patterns from history
 */
export declare function findSimilarPatterns(userId: string, currentState: CurrentSignalState, k?: number): Promise<PatternMatch[]>;
/**
 * Predict trajectory based on pattern matching
 */
export declare function predictTrajectoryFromPatterns(userId: string, currentState: CurrentSignalState): Promise<TrajectoryPrediction | null>;
/**
 * Learn from trajectory outcome
 */
export declare function recordTrajectoryOutcome(userId: string, patternId: string, outcome: {
    resolution: 'natural' | 'intervention' | 'escalation' | 'ongoing';
    actualSeverity?: number;
    actualDuration?: number;
    helpfulInterventions?: string[];
}): Promise<void>;
/**
 * Get trajectory pattern statistics
 */
export declare function getTrajectoryStats(userId: string): {
    totalPatterns: number;
    byTrajectory: Record<string, number>;
    avgSeverity: number;
    successfulInterventions: string[];
};
/**
 * Build trajectory pattern context for LLM
 */
export declare function buildTrajectoryPatternContext(userId: string, currentState: CurrentSignalState): Promise<string>;
export interface TrajectoryPatternsPersistenceData {
    patterns: TrajectoryPattern[];
}
/**
 * Get current state for persistence
 */
export declare function getStateForPersistence(userId: string): TrajectoryPatternsPersistenceData;
/**
 * Hydrate from persisted data
 */
export declare function hydrateFromPersistence(userId: string, data: TrajectoryPatternsPersistenceData): void;
/**
 * Clear user data (for cleanup)
 */
export declare function clearUserData(userId: string): void;
export declare const trajectoryPatterns: {
    recordTrajectoryPattern: typeof recordTrajectoryPattern;
    findSimilarPatterns: typeof findSimilarPatterns;
    predictTrajectoryFromPatterns: typeof predictTrajectoryFromPatterns;
    recordTrajectoryOutcome: typeof recordTrajectoryOutcome;
    getTrajectoryStats: typeof getTrajectoryStats;
    buildTrajectoryPatternContext: typeof buildTrajectoryPatternContext;
    getStateForPersistence: typeof getStateForPersistence;
    hydrateFromPersistence: typeof hydrateFromPersistence;
    clearUserData: typeof clearUserData;
};
export default trajectoryPatterns;
//# sourceMappingURL=trajectory-patterns.d.ts.map