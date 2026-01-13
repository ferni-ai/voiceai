/**
 * Future Self Letters
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Project the user's trajectory and show where they're heading.
 * Generate letters from their "future self" based on patterns.
 *
 * @module FutureSelf
 */
export type LetterTimeframe = '3_months' | '6_months' | '1_year' | '5_years';
export interface PositivePattern {
    pattern: string;
    assumption: string;
    dataPoints: number;
    strength: number;
}
export interface ConcerningPattern {
    pattern: string;
    signal: string;
    dataPoints: number;
    urgency: 'low' | 'medium' | 'high';
}
export interface FutureSelfLetter {
    id: string;
    userId: string;
    timeframe: LetterTimeframe;
    /** Optimistic path letter */
    optimisticPath: {
        letter: string;
        assumptions: string[];
    };
    /** Cautionary path letter */
    cautionaryPath: {
        letter: string;
        warningSignals: string[];
    };
    /** Key insights from all data */
    keyInsights: string[];
    /** Patterns that informed the letter */
    basedOn: {
        positivePatterns: PositivePattern[];
        concerningPatterns: ConcerningPattern[];
    };
    generatedAt: Date;
    expiresAt: Date;
}
export interface FutureSelfContext {
    commitments?: Array<{
        content: string;
        type: string;
    }>;
    dreams?: Array<{
        dream: string;
        status: string;
    }>;
    values?: Array<{
        value: string;
        type: 'stated' | 'demonstrated';
    }>;
    patterns?: Array<{
        pattern: string;
        frequency: string;
    }>;
    capacity?: {
        energyTrend: string;
        burnoutRisk: number;
    };
    narrative?: {
        currentChapter: string;
        theme: string;
    };
    recentTopics?: string[];
    recurringStruggles?: string[];
    recentWins?: string[];
    userName?: string;
}
/**
 * Generate a letter from the user's future self.
 */
export declare function generateFutureSelfLetter(userId: string, timeframe: LetterTimeframe, context: FutureSelfContext): Promise<FutureSelfLetter>;
/**
 * Get the most recent letter for a user.
 */
export declare function getRecentLetter(userId: string, timeframe?: LetterTimeframe): Promise<FutureSelfLetter | null>;
/**
 * Build context for LLM injection.
 */
export declare function buildFutureSelfContext(letter: FutureSelfLetter | null): string;
export declare const futureSelf: {
    generateFutureSelfLetter: typeof generateFutureSelfLetter;
    getRecentLetter: typeof getRecentLetter;
    buildFutureSelfContext: typeof buildFutureSelfContext;
};
export default futureSelf;
//# sourceMappingURL=future-self.d.ts.map