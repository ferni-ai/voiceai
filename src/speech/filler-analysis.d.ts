/**
 * Filler / Subvocal Pattern Analysis
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Not all fillers are equal. This module analyzes "um", "uh", "like" patterns
 * to understand what they reveal about the user's cognitive state:
 *
 * - "Um" at sentence start = gathering thoughts
 * - "Uh" mid-sentence = word-finding difficulty
 * - "Like" as quotative = storytelling mode
 * - Sudden increase in fillers = emotional content incoming
 * - Specific patterns = uncertainty, stalling, or processing
 *
 * @module FillerAnalysis
 */
export type FillerType = 'um' | 'uh' | 'er' | 'ah' | 'like' | 'you_know' | 'i_mean' | 'so' | 'well' | 'basically';
export type FillerPosition = 'sentence_start' | 'mid_thought' | 'before_important' | 'stalling' | 'quotative';
export type FillerMeaning = 'gathering_thoughts' | 'word_finding' | 'stalling' | 'storytelling' | 'hedging' | 'emotional_processing' | 'uncertain' | 'buying_time' | 'normal';
export interface FillerInstance {
    /** Type of filler */
    type: FillerType;
    /** Position in utterance */
    position: FillerPosition;
    /** Character position in text */
    charPosition: number;
    /** Context around the filler */
    context: string;
    /** What this instance likely means */
    meaning: FillerMeaning;
}
export interface FillerPattern {
    /** Overall filler rate (per 100 words) */
    fillerRate: number;
    /** Is this elevated from user's baseline? */
    elevated: boolean;
    /** Dominant filler type */
    dominantType: FillerType | null;
    /** Dominant position */
    dominantPosition: FillerPosition | null;
    /** What the pattern suggests */
    patternMeaning: FillerMeaning;
}
export interface FillerAnalysisResult {
    /** Filler instances found */
    instances: FillerInstance[];
    /** Overall pattern */
    pattern: FillerPattern;
    /** Interpretation */
    interpretation: string;
    /** Is user likely processing something emotional? */
    emotionalProcessing: boolean;
    /** Is user struggling to articulate? */
    articulationDifficulty: boolean;
    /** Guidance for agent */
    guidance: string;
    /** Confidence (0-1) */
    confidence: number;
}
export declare class FillerAnalyzer {
    private history;
    private baselineFillerRate;
    private observationCount;
    private readonly maxHistory;
    constructor();
    /**
     * Analyze text for filler patterns
     */
    analyze(text: string): FillerAnalysisResult;
    /**
     * Get trend across recent utterances
     */
    getTrend(): {
        trend: 'increasing' | 'decreasing' | 'stable';
        avgRate: number;
        consistentPattern: FillerMeaning | null;
    };
    /**
     * Reset analyzer
     */
    reset(): void;
    private detectFillers;
    private getContext;
    private determinePosition;
    private findDominants;
    private determinePatternMeaning;
    private generateInterpretation;
    private generateGuidance;
}
export declare function getFillerAnalyzer(sessionId: string): FillerAnalyzer;
export declare function resetFillerAnalyzer(sessionId: string): void;
export declare function resetAllFillerAnalyzers(): void;
export declare function getActiveFillerAnalyzerCount(): number;
export default FillerAnalyzer;
//# sourceMappingURL=filler-analysis.d.ts.map