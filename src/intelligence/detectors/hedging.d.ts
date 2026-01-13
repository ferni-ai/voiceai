/**
 * Hedging Language Detection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects hedging language patterns that reveal uncertainty, self-protection,
 * or minimization. When someone says "kind of", "maybe", "I guess", they're
 * often protecting themselves from vulnerability or expressing doubt.
 *
 * Real humans pick up on these signals and can gently probe:
 * "You said 'probably nothing' — but is it?"
 *
 * @module HedgingDetection
 */
export type HedgingCategory = 'uncertainty' | 'minimizing' | 'distancing' | 'protecting' | 'qualifying' | 'softening';
export interface HedgingInstance {
    /** The hedging phrase detected */
    phrase: string;
    /** Category of hedging */
    category: HedgingCategory;
    /** Position in text */
    position: number;
    /** Surrounding context */
    context: string;
    /** What it might indicate */
    indicates: string;
}
export interface HedgingAnalysisResult {
    /** Total hedging instances */
    totalHedges: number;
    /** Hedges per 100 words */
    hedgingDensity: number;
    /** Is this significantly more hedging than normal? */
    elevated: boolean;
    /** Breakdown by category */
    byCategory: Record<HedgingCategory, number>;
    /** Dominant hedging style */
    dominantCategory: HedgingCategory | null;
    /** Specific instances */
    instances: HedgingInstance[];
    /** Overall interpretation */
    interpretation: string;
    /** Should agent gently probe? */
    shouldProbe: boolean;
    /** If probing, suggested approach */
    probeApproach?: string;
    /** Confidence (0-1) */
    confidence: number;
}
export declare class HedgingDetector {
    private history;
    private readonly maxHistory;
    constructor();
    /**
     * Analyze text for hedging patterns
     */
    analyze(text: string): HedgingAnalysisResult;
    /**
     * Get hedging trend across recent messages
     */
    getTrend(): {
        trend: 'increasing' | 'decreasing' | 'stable';
        avgDensity: number;
        consistentCategory: HedgingCategory | null;
    };
    /**
     * Build context for LLM prompt
     */
    buildContextForPrompt(): string | null;
    /**
     * Reset detector state
     */
    reset(): void;
    private getContext;
    private generateInterpretation;
}
export declare function getHedgingDetector(sessionId: string): HedgingDetector;
export declare function resetHedgingDetector(sessionId: string): void;
export declare function resetAllHedgingDetectors(): void;
export declare function getActiveHedgingDetectorCount(): number;
export default HedgingDetector;
//# sourceMappingURL=hedging.d.ts.map