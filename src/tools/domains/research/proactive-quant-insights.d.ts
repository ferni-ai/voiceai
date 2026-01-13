/**
 * Proactive Quant Insights System
 *
 * Generates and delivers automated insights for Peter's quant tools:
 * - Daily market briefings
 * - Portfolio alerts (RSI overbought, etc.)
 * - FIRE milestone celebrations
 * - Behavioral pattern recognition
 * - Economic indicator alerts
 *
 * @module tools/domains/research/proactive-quant-insights
 */
import { type QuantInsight, type FinancialProfile, type PortfolioHoldings, type BehavioralTracking, type FIRESnapshot } from './quant-firestore.js';
export interface InsightGenerationResult {
    generated: QuantInsight[];
    errors: string[];
}
export interface DailyBriefing {
    date: Date;
    marketSummary: string;
    portfolioHighlights: string[];
    economicAlerts: string[];
    behavioralCoaching: string[];
    fireProgress: string | null;
    actionItems: string[];
}
/**
 * Generate insights for a user's portfolio
 */
export declare function generatePortfolioInsights(userId: string, portfolio: PortfolioHoldings): Promise<QuantInsight[]>;
/**
 * Generate behavioral insights based on tracking data
 */
export declare function generateBehavioralInsights(userId: string, tracking: BehavioralTracking): Promise<QuantInsight[]>;
/**
 * Generate FIRE milestone insights
 */
export declare function generateFIREInsights(userId: string, profile: FinancialProfile, currentSnapshot: FIRESnapshot, previousSnapshot: FIRESnapshot | null): Promise<QuantInsight[]>;
/**
 * Generate economic condition insights
 */
export declare function generateEconomicInsights(userId: string): Promise<QuantInsight[]>;
/**
 * Generate comprehensive daily briefing
 */
export declare function generateDailyBriefing(userId: string): Promise<DailyBriefing>;
/**
 * Format daily briefing as speech
 */
export declare function formatBriefingForSpeech(briefing: DailyBriefing): string;
/**
 * Run all insight generators for a user
 */
export declare function generateAllInsights(userId: string): Promise<InsightGenerationResult>;
//# sourceMappingURL=proactive-quant-insights.d.ts.map