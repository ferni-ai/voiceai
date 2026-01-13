/**
 * Active Learning System
 *
 * Continuously improves routing through:
 * 1. Correction collection & integration
 * 2. Strategic query selection for labeling
 * 3. Automatic retraining triggers
 * 4. A/B testing of routing strategies
 *
 * The system identifies high-value corrections (ambiguous queries)
 * and uses them to improve the learned retriever and calibration.
 *
 * @module tools/semantic-router/advanced/active-learning
 */
interface CorrectionEvent {
    id: string;
    timestamp: Date;
    userId: string;
    query: string;
    conversationContext: string[];
    predictedTool: string;
    predictedConfidence: number;
    calibratedProbability: number;
    actualTool: string;
    correctionSource: 'explicit' | 'implicit' | 'inferred';
    informationGain: number;
}
interface LearningMetrics {
    totalCorrections: number;
    correctionRate: number;
    accuracyImprovement: number;
    averageConfidenceGap: number;
    mostConfusedPairs: Array<{
        from: string;
        to: string;
        count: number;
    }>;
}
interface ABTestConfig {
    testId: string;
    variants: Array<{
        name: string;
        weight: number;
        config: Record<string, unknown>;
    }>;
    metrics: string[];
    startDate: Date;
    endDate?: Date;
}
export declare class ActiveLearningEngine {
    private corrections;
    private confusionMatrix;
    private accuracyWindows;
    private activeTests;
    private testResults;
    private lastRetrainTime;
    private pendingExamples;
    constructor();
    /**
     * Record a correction event
     */
    recordCorrection(event: Omit<CorrectionEvent, 'id' | 'informationGain'>): Promise<void>;
    /**
     * Record a successful routing (implicit confirmation)
     */
    recordSuccess(userId: string, query: string, toolId: string, confidence: number): void;
    /**
     * Get queries that would be most valuable to label
     */
    selectQueriesForLabeling(k?: number): string[];
    /**
     * Get current learning metrics
     */
    getMetrics(): LearningMetrics;
    /**
     * Start an A/B test
     */
    startABTest(config: ABTestConfig): void;
    /**
     * Get variant for a user in an A/B test
     */
    getTestVariant(testId: string, userId: string): string | null;
    /**
     * Record A/B test metric
     */
    recordTestMetric(testId: string, variant: string, metric: string, value: number): void;
    /**
     * Get A/B test results
     */
    getTestResults(testId: string): Record<string, {
        mean: number;
        stdDev: number;
        count: number;
    }>;
    private calculateInformationGain;
    private updateConfusionMatrix;
    private getConfusionCount;
    private updateAccuracyWindow;
    private getWindowedAccuracy;
    private checkRetrainTrigger;
    private triggerRetrain;
    private schedulePeriodicTasks;
    private hashString;
}
export declare function getActiveLearningEngine(): ActiveLearningEngine;
/**
 * Record a correction (convenience wrapper)
 */
export declare function recordCorrection(userId: string, query: string, predictedTool: string, actualTool: string, confidence: number, context?: string[]): Promise<void>;
/**
 * Record a successful routing (convenience wrapper)
 */
export declare function recordSuccess(userId: string, query: string, toolId: string, confidence: number): void;
export {};
//# sourceMappingURL=active-learning.d.ts.map