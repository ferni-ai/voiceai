/**
 * Uncertainty Quantification & Calibration
 *
 * Transforms raw confidence scores into calibrated probabilities
 * and provides uncertainty estimates for better decision making.
 *
 * Key insight: High similarity ≠ high confidence
 * A 0.8 embedding similarity might only mean 60% chance of correct routing.
 *
 * Implements:
 * 1. Platt Scaling for score calibration
 * 2. Ensemble disagreement for uncertainty
 * 3. Epistemic vs Aleatoric uncertainty separation
 * 4. Adaptive clarification triggers
 *
 * @module tools/semantic-router/advanced/uncertainty
 */
interface ToolMatch {
    toolId: string;
    confidence: number;
    extractedArgs?: Record<string, unknown>;
}
export interface CalibratedResult {
    toolId: string;
    rawScore: number;
    calibratedProbability: number;
    uncertainty: {
        total: number;
        epistemic: number;
        aleatoric: number;
    };
    needsClarification: boolean;
    clarifyingQuestions: string[];
    alternativeInterpretations: string[];
}
interface ValidationExample {
    query: string;
    predictedTool: string;
    actualTool: string;
    rawScore: number;
    wasCorrect: boolean;
}
export declare class UncertaintyCalibrator {
    private params;
    private validationExamples;
    private ensembleScores;
    constructor();
    /**
     * Calibrate a set of tool matches
     */
    calibrate(matches: ToolMatch[], context?: {
        query: string;
        conversationHistory?: string[];
    }): CalibratedResult[];
    /**
     * Add a validation example to improve calibration
     */
    addValidationExample(example: Omit<ValidationExample, 'wasCorrect'>): void;
    /**
     * Get calibration quality metrics
     */
    getCalibrationMetrics(): {
        expectedCalibrationError: number;
        brierScore: number;
        reliability: number;
    };
    private initializeDefaultBiases;
    private calibrateMatch;
    private plattScale;
    private getToolBias;
    private calculateUncertainty;
    private updateEnsembleScores;
    private calculateEnsembleVariance;
    private calculateAmbiguity;
    private assessClarificationNeed;
    private generateClarifyingQuestion;
    private generateArgClarification;
    private recalibrate;
    private createCalibrationBins;
}
export declare function getCalibrator(): UncertaintyCalibrator;
export {};
//# sourceMappingURL=uncertainty.d.ts.map