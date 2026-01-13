/**
 * Hypothesis Generator
 *
 * AI-driven analysis of completed experiments to:
 * 1. Identify winning patterns across experiments
 * 2. Generate new hypotheses based on patterns
 * 3. Auto-create draft experiments for testing
 *
 * Better than human: We learn from every experiment.
 *
 * @module services/experiments/hypothesis-generator
 */
export interface ExperimentPattern {
    attribute: string;
    winningValue: string;
    confidence: number;
    sampleSize: number;
    experimentIds: string[];
    discoveredAt: Date;
}
export interface GeneratedHypothesis {
    id: string;
    name: string;
    rationale: string;
    basedOnPatterns: string[];
    variants: Array<{
        id: string;
        name: string;
        weight: number;
        content: unknown;
    }>;
    expectedLift: number;
    confidence: number;
    status: 'draft' | 'approved' | 'rejected' | 'running';
    createdAt: Date;
}
export interface PatternAnalysisResult {
    patterns: ExperimentPattern[];
    hypotheses: GeneratedHypothesis[];
    experimentsAnalyzed: number;
    totalSamples: number;
}
/**
 * Analyze completed experiments to find winning patterns
 */
export declare function analyzeWinningPatterns(): Promise<ExperimentPattern[]>;
/**
 * Generate new experiment hypotheses based on patterns
 */
export declare function generateHypotheses(patterns: ExperimentPattern[]): Promise<GeneratedHypothesis[]>;
/**
 * Save a generated hypothesis to Firestore
 */
export declare function saveHypothesis(hypothesis: GeneratedHypothesis): Promise<void>;
/**
 * Get all generated hypotheses
 */
export declare function getHypotheses(status?: GeneratedHypothesis['status']): Promise<GeneratedHypothesis[]>;
/**
 * Update hypothesis status
 */
export declare function updateHypothesisStatus(hypothesisId: string, status: GeneratedHypothesis['status']): Promise<void>;
/**
 * Save discovered patterns
 */
export declare function savePatterns(patterns: ExperimentPattern[]): Promise<void>;
/**
 * Run full pattern analysis and hypothesis generation
 */
export declare function runAnalysis(): Promise<PatternAnalysisResult>;
declare const _default: {
    analyzeWinningPatterns: typeof analyzeWinningPatterns;
    generateHypotheses: typeof generateHypotheses;
    saveHypothesis: typeof saveHypothesis;
    getHypotheses: typeof getHypotheses;
    updateHypothesisStatus: typeof updateHypothesisStatus;
    savePatterns: typeof savePatterns;
    runAnalysis: typeof runAnalysis;
};
export default _default;
//# sourceMappingURL=hypothesis-generator.d.ts.map