/**
 * Proactive Hooks for Simple Utilities
 *
 * Don't wait to be asked - offer help at the right moment.
 * This is what makes Ferni feel like a friend who anticipates your needs.
 *
 * HOOK TRIGGERS:
 * 1. Time of day - "It's 3pm, want your usual tea timer?"
 * 2. Topic detection - "Sounds like you're cooking, need conversions?"
 * 3. Pattern recognition - "Third Tokyo check, planning a trip?"
 * 4. Calendar awareness - "Your meeting's in Tokyo time tomorrow..."
 * 5. Life event proximity - "7 days until your anniversary!"
 */
export interface ProactiveContext {
    userId: string;
    currentTime: Date;
    conversationTopics?: string[];
    recentUserInput?: string;
    lifeEvents?: Array<{
        event: string;
        date: Date;
        type: string;
    }>;
    travelPlans?: Array<{
        destination: string;
        startDate: Date;
    }>;
}
export interface ProactiveOffer {
    type: 'timer' | 'conversion' | 'timezone' | 'countdown' | 'tip' | 'decision';
    message: string;
    action?: string;
    actionParams?: Record<string, unknown>;
    priority: 'high' | 'normal' | 'low';
    expiresAt?: Date;
}
/**
 * Evaluate all proactive hooks and return offers
 * Call this at conversation start and periodically during long conversations
 */
export declare function evaluateProactiveHooks(context: ProactiveContext): Promise<ProactiveOffer[]>;
/**
 * Get proactive opener for conversation start
 * Returns the best proactive offer to mention naturally
 */
export declare function getProactiveOpener(userId: string, context?: Partial<ProactiveContext>): Promise<string | null>;
/**
 * Check if we should inject a proactive suggestion mid-conversation
 */
export declare function shouldInjectProactiveSuggestion(userId: string, conversationTurnCount: number, lastActivityMinutes: number): Promise<string | null>;
/**
 * Run daily proactive checks for all users
 * Call this from a scheduled function
 */
export declare function runDailyProactiveChecks(userIds: string[]): Promise<Map<string, ProactiveOffer[]>>;
declare const _default: {
    evaluateProactiveHooks: typeof evaluateProactiveHooks;
    getProactiveOpener: typeof getProactiveOpener;
    shouldInjectProactiveSuggestion: typeof shouldInjectProactiveSuggestion;
    runDailyProactiveChecks: typeof runDailyProactiveChecks;
};
export default _default;
//# sourceMappingURL=proactive-hooks.d.ts.map