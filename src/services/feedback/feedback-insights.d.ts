/**
 * Feedback Insights Generator
 *
 * Analyzes aggregated feedback to generate actionable insights:
 * - Per-persona resonance rates
 * - Topics that land well vs. fall flat
 * - User's preferred conversation depth
 * - Time-of-day engagement patterns
 *
 * These insights help both the AI (via context injection) and the user
 * (via reflection UI) understand what's working.
 *
 * @module services/feedback/feedback-insights
 */
import type { FeedbackInsights } from './types.js';
/**
 * Generate insights from a user's feedback history.
 */
export declare function generateFeedbackInsights(userId: string): Promise<FeedbackInsights | null>;
export declare const feedbackInsightsService: {
    generate: typeof generateFeedbackInsights;
};
export default feedbackInsightsService;
//# sourceMappingURL=feedback-insights.d.ts.map