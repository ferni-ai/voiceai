/**
 * Peter's Superhuman Analytics Services
 *
 * "Better Than Human" persistence layer for Peter's pattern recognition capabilities.
 * These services provide the superhuman memory that makes Peter's analytics transcendent.
 *
 * SERVICES:
 *   1. Blind Spot Mirror - Patterns they're avoiding
 *   2. Counterfactual Simulator - Roads not taken
 *   3. Pattern Prediction - Where trajectories are heading
 *   4. Decision Quality - Rate decisions over time
 *   5. Correlation Finder - Cross-domain connections
 *   6. Anomaly Detector - Unusual patterns
 *   7. Insight Archive - Personal knowledge base
 *
 * FIRESTORE COLLECTIONS:
 *   bogle_users/{userId}/blind_spots
 *   bogle_users/{userId}/counterfactuals
 *   bogle_users/{userId}/pattern_predictions
 *   bogle_users/{userId}/decision_scores
 *   bogle_users/{userId}/correlations
 *   bogle_users/{userId}/anomalies
 *   bogle_users/{userId}/insights
 */
export interface BlindSpot {
    domain: string;
    observation: string;
    evidence?: string;
    recordedAt: string;
}
export interface Counterfactual {
    originalDecision: string;
    alternativePath: string;
    domain: string;
    outcome?: string;
    lesson?: string;
    recordedAt: string;
}
export interface PatternPrediction {
    pattern: string;
    domain: string;
    currentTrajectory: 'improving' | 'declining' | 'stable' | 'volatile';
    prediction?: string;
    timeframe?: string;
    recordedAt: string;
}
export interface DecisionScore {
    decision: string;
    domain: string;
    outcome: 'great' | 'good' | 'neutral' | 'poor' | 'bad';
    processQuality?: string;
    lesson?: string;
    recordedAt: string;
}
export interface Correlation {
    factor1: string;
    factor2: string;
    relationship: 'positive' | 'negative' | 'complex' | 'unknown';
    strength?: 'weak' | 'moderate' | 'strong';
    insight?: string;
    recordedAt: string;
}
export interface Anomaly {
    anomaly: string;
    domain: string;
    severity: 'info' | 'warning' | 'alert';
    interpretation?: string;
    recordedAt: string;
}
export interface Insight {
    insight: string;
    domain: string;
    source: string;
    importance: 'low' | 'medium' | 'high' | 'critical';
    recordedAt: string;
}
export declare function recordBlindSpot(userId: string, blindSpot: BlindSpot): Promise<void>;
export declare function getBlindSpots(userId: string, domain?: string): Promise<BlindSpot[]>;
export declare function recordCounterfactual(userId: string, counterfactual: Counterfactual): Promise<void>;
export declare function getCounterfactuals(userId: string): Promise<Counterfactual[]>;
export declare function recordPatternPrediction(userId: string, prediction: PatternPrediction): Promise<void>;
export declare function getPatternPredictions(userId: string, domain?: string): Promise<PatternPrediction[]>;
export declare function recordDecisionScore(userId: string, score: DecisionScore): Promise<void>;
export declare function getDecisionScores(userId: string, domain?: string): Promise<DecisionScore[]>;
export declare function recordCorrelation(userId: string, correlation: Correlation): Promise<void>;
export declare function getCorrelations(userId: string): Promise<Correlation[]>;
export declare function recordAnomaly(userId: string, anomaly: Anomaly): Promise<void>;
export declare function getAnomalies(userId: string): Promise<Anomaly[]>;
export declare function recordInsight(userId: string, insight: Insight): Promise<void>;
export declare function getInsights(userId: string, domain?: string): Promise<Insight[]>;
export declare function buildPeterAnalyticsContext(userId: string): Promise<string>;
declare const _default: {
    recordBlindSpot: typeof recordBlindSpot;
    getBlindSpots: typeof getBlindSpots;
    recordCounterfactual: typeof recordCounterfactual;
    getCounterfactuals: typeof getCounterfactuals;
    recordPatternPrediction: typeof recordPatternPrediction;
    getPatternPredictions: typeof getPatternPredictions;
    recordDecisionScore: typeof recordDecisionScore;
    getDecisionScores: typeof getDecisionScores;
    recordCorrelation: typeof recordCorrelation;
    getCorrelations: typeof getCorrelations;
    recordAnomaly: typeof recordAnomaly;
    getAnomalies: typeof getAnomalies;
    recordInsight: typeof recordInsight;
    getInsights: typeof getInsights;
    buildPeterAnalyticsContext: typeof buildPeterAnalyticsContext;
};
export default _default;
//# sourceMappingURL=peter-analytics-services.d.ts.map