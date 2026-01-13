/**
 * Speech Fluency Analysis
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Analyzes speech fluency patterns to understand the user's inner state.
 * Stammering, self-corrections, and repetitions reveal emotional blocks,
 * uncertainty, or difficulty finding words.
 *
 * Real humans notice when someone is struggling to express themselves.
 * This module gives Ferni that same awareness.
 *
 * @module FluencyAnalysis
 */
export type DisfluencyType = 'repetition' | 'prolongation' | 'block' | 'revision' | 'interjection' | 'restart' | 'trailing';
export type FluencyPattern = 'word_finding' | 'emotional_block' | 'rushing' | 'careful' | 'normal';
export interface Disfluency {
    type: DisfluencyType;
    text: string;
    position: number;
    context: string;
}
export interface DisfluencyCounts {
    repetitions: number;
    prolongations: number;
    blocks: number;
    revisions: number;
    interjections: number;
    restarts: number;
    trailing: number;
}
export interface FluencyAnalysisResult {
    /** Overall fluency score (0-1, higher = more fluent) */
    overallFluency: number;
    /** Breakdown of disfluency types */
    disfluencies: DisfluencyCounts;
    /** Total disfluencies detected */
    totalDisfluencies: number;
    /** Disfluencies per 100 words */
    disfluencyRate: number;
    /** Detected pattern */
    pattern: FluencyPattern;
    /** What this pattern might indicate */
    interpretation: string;
    /** Specific disfluencies found */
    instances: Disfluency[];
    /** Confidence in analysis (0-1) */
    confidence: number;
    /** Guidance for agent response */
    guidance: string;
}
export declare class FluencyAnalyzer {
    private history;
    private readonly maxHistory;
    constructor();
    /**
     * Analyze text for fluency patterns
     */
    analyze(text: string): FluencyAnalysisResult;
    /**
     * Get trend across recent utterances
     */
    getTrend(): {
        trend: 'improving' | 'declining' | 'stable';
        avgFluency: number;
        dominantPattern: FluencyPattern;
    };
    /**
     * Reset analyzer state
     */
    reset(): void;
    private getContext;
    private determinePattern;
    private generateInterpretation;
    private generateGuidance;
}
export declare function getFluencyAnalyzer(sessionId: string): FluencyAnalyzer;
export declare function resetFluencyAnalyzer(sessionId: string): void;
export declare function resetAllFluencyAnalyzers(): void;
export declare function getActiveFluencyAnalyzerCount(): number;
export default FluencyAnalyzer;
//# sourceMappingURL=fluency-analysis.d.ts.map