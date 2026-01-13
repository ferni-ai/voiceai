/**
 * Social Graph Context Builder
 *
 * "Better than Human" - We track who matters in your life and notice patterns
 * that even you might miss.
 *
 * This context builder injects social intelligence into every conversation:
 * - Who you've been talking about (and who you haven't)
 * - How your energy changes when discussing different people
 * - Important dates and relationship milestones
 * - Withdrawal detection (haven't mentioned someone in a while)
 *
 * @module intelligence/context-builders/social-graph-context
 */
import type { ContextInjection } from '../core/types.js';
interface SocialGraphContextParams {
    userId: string;
    currentTopic?: string;
    turnCount: number;
}
/**
 * Build social graph context injections.
 *
 * Surfaces superhuman relationship intelligence:
 * - Withdrawal alerts ("You haven't mentioned Sarah in 2 weeks")
 * - Sentiment patterns ("Mike conversations tend to drain you")
 * - Important dates ("Your mom's birthday is tomorrow")
 * - Relationship insights
 */
export declare function buildSocialGraphContext(params: SocialGraphContextParams): Promise<ContextInjection[]>;
export { buildSocialGraphContext as buildSocialGraphContextBuilder };
//# sourceMappingURL=social-graph-context.d.ts.map