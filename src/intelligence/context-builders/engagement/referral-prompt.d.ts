/**
 * Referral Prompt Injection
 *
 * Guides Ferni to naturally ask about sharing with friends.
 *
 * BRAND COMPLIANCE:
 * - Frame as sharing a friend, not recruiting
 * - "No pressure" always
 * - Only when conversation naturally leads to it
 * - Maximum once per week per user
 *
 * @module referral-prompt
 */
/**
 * Simple context injection for referral prompts.
 * Uses numeric priority to match agents/processors interface.
 */
interface SimpleContextInjection {
    category: string;
    content: string;
    priority: number;
}
export interface ReferralPromptContext {
    userId: string;
    personaId: string;
    turnCount: number;
    relationshipStage: 'new' | 'building' | 'established' | 'deep';
    userMood?: 'positive' | 'neutral' | 'struggling' | 'crisis';
    recentTopics?: string[];
    userText?: string;
}
export interface ReferralPromptResult {
    shouldInject: boolean;
    injection?: SimpleContextInjection;
    reason?: string;
}
/**
 * Build referral prompt injection if conditions are right
 *
 * This is designed to be VERY conservative - we'd rather miss opportunities
 * than feel pushy or salesy.
 */
export declare function buildReferralPromptInjection(ctx: ReferralPromptContext): Promise<ReferralPromptResult>;
/**
 * Build context injection for referral conversations that have happened
 *
 * This brings the results of previous referral calls back into the natural flow.
 * For example, if the user asked Ferni to call their friend Sarah, and Ferni did,
 * this context lets Ferni naturally mention how that call went.
 */
export declare function buildReferralConversationContext(): SimpleContextInjection | null;
declare const _default: {
    buildReferralPromptInjection: typeof buildReferralPromptInjection;
    buildReferralConversationContext: typeof buildReferralConversationContext;
    CONFIG: {
        minTurnsBeforeReferral: number;
        minDaysBetweenPrompts: number;
        allowedMoods: readonly ["positive", "neutral"];
        allowedRelationshipStages: readonly ["established", "deep"];
        naturalTriggers: string[];
        naturalTopics: string[];
    };
};
export default _default;
//# sourceMappingURL=referral-prompt.d.ts.map