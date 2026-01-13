/**
 * Thinking of You - Random Kindness System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This is a SUPERHUMAN capability: reaching out just because we care,
 * not because there's a task to accomplish. A human friend might think
 * of you but never text. Ferni ACTS on that thought.
 *
 * Types of "thinking of you" outreach:
 * 1. **Random Kindness**: Just because
 * 2. **Relevant Content**: "Saw this and thought of you"
 * 3. **Anniversary**: "It's been X months since we started!"
 * 4. **Seasonal**: "How are you handling winter?"
 * 5. **After Silence**: Gentle reconnection after long gap
 * 6. **Milestone Reflection**: "Remember when you started this journey?"
 * 7. **Life Event Check**: "How was the wedding?"
 * 8. **Appreciation**: "I just want to say I'm proud of you"
 * 9. **Humor**: Share something funny/relevant
 *
 * Philosophy:
 * - These should feel SURPRISING, not expected
 * - They should NOT feel like a marketing drip campaign
 * - Frequency should match relationship depth
 * - Always have an opt-out feel (no response required)
 *
 * @module ThinkingOfYou
 */
import type { UserProfile } from '../../types/user-profile.js';
export type ThinkingOfYouTrigger = 'random_kindness' | 'relevant_content' | 'anniversary' | 'seasonal' | 'after_silence' | 'milestone_reflection' | 'life_event_check' | 'appreciation' | 'humor' | 'pending_followup' | 'hard_date_approaching';
export type OutreachChannel = 'sms' | 'email' | 'voice_message' | 'push';
export type PersonaId = 'ferni' | 'maya' | 'peter' | 'alex' | 'jordan' | 'nayan';
export interface ThinkingOfYouOutreach {
    id: string;
    userId: string;
    personaId: PersonaId;
    trigger: ThinkingOfYouTrigger;
    channel: OutreachChannel;
    /** The message to send */
    message: string;
    /** When to send it */
    scheduledFor: Date;
    /** Why we're reaching out (internal) */
    reason: string;
    /** Has it been sent? */
    sent: boolean;
    sentAt?: Date;
    /** Did they respond? */
    responseReceived: boolean;
    responseReceivedAt?: Date;
    responseType?: 'positive' | 'neutral' | 'negative' | 'none';
}
export interface ThinkingOfYouConfig {
    /** Base weekly probability of random outreach */
    baseWeeklyProbability: number;
    /** Max outreach per week */
    maxPerWeek: number;
    /** Minimum days between outreach */
    minDaysBetween: number;
    /** Probability boosts */
    probabilityBoosts: {
        userSeemingDown: number;
        longTimeSinceContact: number;
        upcomingChallenge: number;
        recentBigWin: number;
        seasonalRelevance: number;
        relationshipMilestone: number;
        pendingFollowUp: number;
        hardDateApproaching: number;
    };
}
export interface RecentWin {
    description: string;
    date?: Date;
    category?: string;
}
export interface UserOutreachContext {
    profile: UserProfile;
    daysSinceLastContact: number;
    daysSinceLastOutreach: number;
    emotionalState: 'thriving' | 'stable' | 'struggling';
    upcomingEvents: Array<{
        date: Date;
        description: string;
    }>;
    recentWins: RecentWin[];
    relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    outreachCountThisWeek: number;
}
export declare class ThinkingOfYouEngine {
    private config;
    private pendingOutreach;
    private outreachHistory;
    constructor(config?: Partial<ThinkingOfYouConfig>);
    /**
     * Decide whether to reach out and what to say
     */
    shouldReachOut(context: UserOutreachContext): {
        shouldSend: boolean;
        trigger?: ThinkingOfYouTrigger;
        persona?: PersonaId;
        reason?: string;
    };
    /**
     * Select the most appropriate trigger based on context
     * PRIORITY ORDER: Hard dates > Pending follow-ups > Silence > Life events > Everything else
     */
    private selectTrigger;
    /**
     * Select the best persona for this outreach
     */
    private selectPersona;
    /**
     * Check if we're in a seasonal moment
     */
    private isSeasonalMoment;
    /**
     * Check if we should reach out based on learned patterns from BetterThanHuman
     * Uses anticipatory presence engine to detect optimal timing
     */
    shouldReachOutWithPatterns(userId: string, context: UserOutreachContext): {
        shouldSend: boolean;
        trigger?: ThinkingOfYouTrigger;
        persona?: PersonaId;
        reason?: string;
        learnedPattern?: string;
    };
    /**
     * Map anticipation type to outreach trigger
     */
    private mapAnticipationToTrigger;
    /**
     * Get optimal outreach time based on learned patterns
     */
    getOptimalOutreachTime(userId: string): {
        patternDescription: string;
        confidence: number;
    } | null;
    /**
     * Generate the outreach message (static/fallback version)
     */
    generateMessage(trigger: ThinkingOfYouTrigger, persona: PersonaId, context: UserOutreachContext): string;
    /**
     * Generate a dynamic outreach message using LLM
     *
     * This is the "Better than Human" version that creates truly personalized
     * outreach based on what we know about the user.
     *
     * @param trigger - Type of outreach
     * @param persona - Persona sending the message
     * @param context - User context
     * @returns Promise<string> with dynamic message
     */
    generateDynamicMessage(trigger: ThinkingOfYouTrigger, persona: PersonaId, context: UserOutreachContext): Promise<string>;
    /**
     * Create a new outreach
     */
    createOutreach(userId: string, trigger: ThinkingOfYouTrigger, persona: PersonaId, context: UserOutreachContext, scheduledFor?: Date): ThinkingOfYouOutreach;
    /**
     * Mark outreach as sent
     */
    markSent(outreachId: string): void;
    /**
     * Record response to outreach
     */
    recordResponse(outreachId: string, responseType: 'positive' | 'neutral' | 'negative' | 'none'): void;
    /**
     * Get pending outreach
     */
    getPendingOutreach(): ThinkingOfYouOutreach[];
    /**
     * Get outreach history
     */
    getHistory(): ThinkingOfYouOutreach[];
    /**
     * Get stats
     */
    getStats(): {
        totalSent: number;
        positiveResponses: number;
        byTrigger: Record<ThinkingOfYouTrigger, number>;
        responseRate: number;
    };
}
export declare function getThinkingOfYouEngine(): ThinkingOfYouEngine;
/**
 * Start the Thinking of You engine
 */
export declare function startThinkingOfYouEngine(): void;
/**
 * Stop the Thinking of You engine
 */
export declare function stopThinkingOfYouEngine(): void;
/**
 * Get current season based on date
 */
export declare function getCurrentSeason(): 'spring' | 'summer' | 'fall' | 'winter';
/**
 * Check if we're in a season transition (within 2 weeks of equinox/solstice)
 */
export declare function isSeasonTransition(): boolean;
export default ThinkingOfYouEngine;
//# sourceMappingURL=thinking-of-you.d.ts.map