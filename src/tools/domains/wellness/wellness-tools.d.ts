/**
 * Wellness Tools
 *
 * Domain: Financial and mental wellness support.
 * Single responsibility: Helping users feel better about their financial life.
 *
 * Money is emotional. Jack understands that financial wellness isn't just
 * about the numbers - it's about how money makes you FEEL.
 *
 * This module covers:
 * - Financial anxiety and stress
 * - Money mindset and beliefs
 * - Motivation and encouragement
 * - Perspective and reframing
 * - Gratitude and contentment
 */
import { llm } from '@livekit/agents';
declare const ENCOURAGEMENT_MESSAGES: {
    starting_out: string[];
    staying_consistent: string[];
    after_setback: string[];
    reaching_goals: string[];
};
declare const REFRAMING_PERSPECTIVES: {
    spending_guilt: {
        unhealthy: string;
        reframed: string;
        jackWisdom: string;
    };
    investment_losses: {
        unhealthy: string;
        reframed: string;
        jackWisdom: string;
    };
    late_start: {
        unhealthy: string;
        reframed: string;
        jackWisdom: string;
    };
    small_amounts: {
        unhealthy: string;
        reframed: string;
        jackWisdom: string;
    };
    risk_aversion: {
        unhealthy: string;
        reframed: string;
        jackWisdom: string;
    };
};
/**
 * Respond to financial anxiety
 */
export declare function respondToAnxiety(anxietyType: string): string;
/**
 * Provide encouragement based on where someone is in their journey
 */
export declare function provideEncouragement(stage: keyof typeof ENCOURAGEMENT_MESSAGES): string;
/**
 * Reframe an unhealthy money belief
 */
export declare function reframeBelief(beliefType: keyof typeof REFRAMING_PERSPECTIVES): string;
export declare function createWellnessTools(): {
    addressFinancialAnxiety: llm.FunctionTool<{
        anxietyType: "market_fear" | "not_enough" | "behind_peers" | "decision_paralysis" | "past_mistakes" | "uncertain_future";
    }, unknown, string>;
    provideEncouragement: llm.FunctionTool<{
        stage: "starting_out" | "staying_consistent" | "after_setback" | "reaching_goals";
    }, unknown, string>;
    reframeMoneyBelief: llm.FunctionTool<{
        beliefType: "spending_guilt" | "investment_losses" | "late_start" | "small_amounts" | "risk_aversion";
    }, unknown, string>;
    checkInOnWellbeing: llm.FunctionTool<{
        focus?: "confidence" | "progress" | "overall" | "stress_level" | undefined;
    }, unknown, string>;
    practiceGratitude: llm.FunctionTool<Record<string, never>, unknown, string>;
};
export default createWellnessTools;
//# sourceMappingURL=wellness-tools.d.ts.map