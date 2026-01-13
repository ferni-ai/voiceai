/**
 * Pattern Intelligence for Simple Utilities
 *
 * This is what makes Ferni "better than human" for everyday utilities.
 *
 * SIRI PROBLEM: Transactional. Answer and forget.
 * HUMAN FRIEND: Remembers patterns, anticipates needs, follows up.
 * FERNI: All of that PLUS catches things humans miss.
 *
 * "BETTER THAN HUMAN" PRINCIPLES:
 *
 * 1. PATTERN RECOGNITION
 *    - "You always set a 5-min timer around 3pm - tea time?"
 *    - "Third Tokyo timezone check this week - planning something?"
 *    - "You've been splitting bills more lately - new dining crew?"
 *
 * 2. PROACTIVE WISDOM (without being preachy)
 *    - After low tip: "That's 12% - totally fine if service was rough"
 *    - After coin flip: "Noticed you've flipped 5 coins today - big decisions brewing?"
 *    - After timer: "Timer done! How did it turn out?"
 *
 * 3. ANTICIPATORY HELP
 *    - "Want me to set your usual 5-minute tea timer?"
 *    - "Calling Tokyo? Remember it's 14 hours ahead right now"
 *    - "Last time you split a bill at this amount, you did 20% tip"
 *
 * 4. CONNECTED DOTS
 *    - Links timezone checks to remembered travel plans
 *    - Connects unit conversions to cooking/baking context
 *    - Ties decision-making patterns to life events
 *
 * 5. CELEBRATION OF SMALL MOMENTS
 *    - "That's 100 days until your trip!"
 *    - "Fun fact: you've used the tip calculator 50 times - you're a generous tipper"
 */
export interface UtilityUsage {
    tool: string;
    timestamp: Date;
    params: Record<string, unknown>;
    context?: string;
}
export interface UserUtilityPatterns {
    userId: string;
    usageHistory: UtilityUsage[];
    patterns: {
        commonTimerDurations: Array<{
            minutes: number;
            count: number;
            usualTime?: string;
            label?: string;
        }>;
        lastTimerFollowUp?: {
            duration: number;
            label: string;
            askedAbout: boolean;
        };
        averageTipPercent: number;
        tipCount: number;
        lastTipContext?: {
            amount: number;
            percent: number;
            venue?: string;
        };
        frequentCities: Array<{
            city: string;
            count: number;
            lastChecked: Date;
        }>;
        possibleTravelPlanning?: {
            city: string;
            checksThisWeek: number;
        };
        coinFlipsToday: number;
        coinFlipsThisWeek: number;
        recentDecisionTopics: string[];
        frequentConversions: Array<{
            from: string;
            to: string;
            count: number;
        }>;
        likelyCookingSession?: boolean;
        countdownsTracked: Array<{
            event: string;
            targetDate: Date;
            checksCount: number;
        }>;
    };
    preferences: {
        defaultTipPercent?: number;
        preferredTimezone?: string;
        usualTimerDuration?: number;
    };
    pendingFollowUps: Array<{
        type: 'timer_complete' | 'decision_check' | 'trip_planning' | 'countdown_milestone';
        context: Record<string, unknown>;
        scheduledFor?: Date;
    }>;
}
/**
 * Get or create user patterns
 */
export declare function getUserPatterns(userId: string): UserUtilityPatterns;
/**
 * Record a utility usage and update patterns
 */
export declare function recordUsage(userId: string, tool: string, params: Record<string, unknown>, context?: string): void;
/**
 * Generate "better than human" insights for a tool response
 */
export declare function generateInsight(userId: string, tool: string, params: Record<string, unknown>, baseResponse: string): {
    response: string;
    followUp?: string;
    proactiveOffer?: string;
};
/**
 * Generate proactive suggestions based on patterns
 */
export declare function getProactiveSuggestions(userId: string): string[];
/**
 * Get timer follow-up message after timer completes
 */
export declare function getTimerFollowUp(userId: string): string | null;
declare const _default: {
    getUserPatterns: typeof getUserPatterns;
    recordUsage: typeof recordUsage;
    generateInsight: typeof generateInsight;
    getProactiveSuggestions: typeof getProactiveSuggestions;
    getTimerFollowUp: typeof getTimerFollowUp;
};
export default _default;
//# sourceMappingURL=pattern-intelligence.d.ts.map