/**
 * SEC Intelligence Context Builder
 *
 * Provides Peter (The Quant) with institutional-grade SEC intelligence.
 * "Better than Human" - Track insider trading, filings, and institutional moves.
 *
 * Superhuman Capabilities:
 * - Real-time SEC filing alerts
 * - Insider trading pattern detection
 * - Institutional ownership changes (13F)
 * - Material event notifications (8-K)
 *
 * @module intelligence/context-builders/sec-intelligence
 */
interface SECContext {
    /** Proactive SEC insights for mentioned companies */
    insights: string[];
    /** Recent material filings */
    recentFilings: {
        ticker: string;
        form: string;
        date: string;
        description: string;
    }[];
    /** Insider trading sentiment */
    insiderSentiment: {
        ticker: string;
        sentiment: 'bullish' | 'bearish' | 'neutral';
        summary: string;
    }[];
    /** Formatted context for LLM */
    contextString: string;
}
/**
 * Extract potential stock tickers from conversation
 */
declare function extractTickers(text: string): string[];
/**
 * Build SEC intelligence context for Peter
 *
 * Called during context injection when Peter is active
 */
export declare function buildSECIntelligenceContext(userId: string, recentTranscript: string, watchlistTickers?: string[]): Promise<SECContext | null>;
/**
 * Generate superhuman SEC moment for Peter
 *
 * Used for proactive insights during conversation
 */
export declare function generateSuperhumanSECMoment(ticker: string): Promise<string | null>;
declare const _default: {
    buildSECIntelligenceContext: typeof buildSECIntelligenceContext;
    generateSuperhumanSECMoment: typeof generateSuperhumanSECMoment;
    extractTickers: typeof extractTickers;
};
export default _default;
//# sourceMappingURL=sec-intelligence.d.ts.map