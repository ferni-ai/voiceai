/**
 * Post-Event Learning Service
 *
 * "No one follows up to learn what you'd do differently."
 *
 * This service captures learnings after events and applies them to future planning:
 * - Automated follow-up prompts at the right times
 * - Learning capture (what worked, what to change)
 * - Application of learnings to similar future events
 * - Wisdom accumulation over time
 *
 * Better Than Human: We follow up at the perfect times and remember
 * every lesson learned to apply to future events.
 *
 * @module services/superhuman/post-event-learning
 */
export interface EventLearning {
    /** Unique ID */
    id: string;
    /** Original event name */
    eventName: string;
    /** Event type for matching to future events */
    eventType: string;
    /** Event date */
    eventDate: string;
    /** What worked well */
    whatWorked: Array<{
        item: string;
        category: 'venue' | 'catering' | 'timing' | 'guests' | 'activities' | 'budget' | 'other';
        importance: 'minor' | 'moderate' | 'major';
    }>;
    /** What to change */
    whatToChange: Array<{
        item: string;
        category: 'venue' | 'catering' | 'timing' | 'guests' | 'activities' | 'budget' | 'other';
        recommendation: string;
        importance: 'minor' | 'moderate' | 'major';
    }>;
    /** Unexpected challenges */
    unexpectedChallenges: Array<{
        challenge: string;
        howHandled: string;
        preventionTip?: string;
    }>;
    /** Budget learnings */
    budgetLearnings: {
        plannedTotal: number;
        actualTotal: number;
        surpriseCosts: Array<{
            item: string;
            amount: number;
        }>;
        worthTheSplurge: string[];
        notWorthIt: string[];
    };
    /** Timing learnings */
    timingLearnings: {
        leadTimeUsed: string;
        leadTimeNeeded: string;
        bestDecisions: string[];
        lastMinuteStress: string[];
    };
    /** Guest learnings */
    guestLearnings: {
        perfectGuestCount: number | null;
        whoMadeItSpecial: string[];
        wishHadInvited: string[];
        wouldNotInviteAgain: string[];
    };
    /** Vendor learnings */
    vendorLearnings: Array<{
        vendor: string;
        category: string;
        rating: 1 | 2 | 3 | 4 | 5;
        wouldUseAgain: boolean;
        notes: string;
    }>;
    /** Overall satisfaction */
    overallSatisfaction: number;
    /** Key takeaway */
    keyTakeaway: string;
    /** When captured */
    capturedAt: string;
    /** Follow-up stages completed */
    followUpStages: Array<{
        stage: 'immediate' | 'one_week' | 'one_month';
        completedAt: string;
    }>;
}
export interface FollowUpPrompt {
    /** Stage of follow-up */
    stage: 'immediate' | 'one_week' | 'one_month';
    /** When to prompt (days after event) */
    daysAfterEvent: number;
    /** Questions to ask */
    questions: string[];
}
export interface AppliedWisdom {
    /** Source event */
    sourceEvent: string;
    /** Learning being applied */
    learning: string;
    /** How it's being applied */
    application: string;
    /** Category */
    category: string;
}
export interface PostEventLearningProfile {
    userId: string;
    /** All event learnings */
    learnings: EventLearning[];
    /** Events pending follow-up */
    pendingFollowUps: Array<{
        eventId: string;
        eventName: string;
        eventDate: string;
        eventType: string;
        nextFollowUp: {
            stage: 'immediate' | 'one_week' | 'one_month';
            dueDate: string;
        };
    }>;
    /** Accumulated wisdom (distilled from all learnings) */
    accumulatedWisdom: Array<{
        category: string;
        eventType: string;
        wisdom: string;
        sourceCount: number;
    }>;
    lastUpdated: string;
}
declare function loadLearningProfile(userId: string): Promise<PostEventLearningProfile | null>;
/**
 * Schedule follow-ups for a completed event
 */
export declare function scheduleEventFollowUps(userId: string, eventId: string, eventName: string, eventDate: string, eventType: string): Promise<void>;
/**
 * Get follow-ups that are due
 */
export declare function getDueFollowUps(userId: string): Promise<Array<{
    eventId: string;
    eventName: string;
    eventDate: string;
    eventType: string;
    stage: 'immediate' | 'one_week' | 'one_month';
    questions: string[];
}>>;
/**
 * Record learning from a follow-up conversation
 */
export declare function recordLearning(userId: string, eventId: string, stage: 'immediate' | 'one_week' | 'one_month', learning: Partial<EventLearning>): Promise<void>;
/**
 * Get learnings applicable to a new event
 */
export declare function getApplicableLearnings(userId: string, eventType: string): Promise<AppliedWisdom[]>;
/**
 * Get a summary of all learnings for an event type
 */
export declare function getLearningSummary(userId: string, eventType: string): Promise<{
    totalEventsOfType: number;
    avgSatisfaction: number;
    topLearnings: string[];
    commonMistakes: string[];
    budgetTrends: string;
}>;
/**
 * Build context string for LLM injection
 */
export declare function buildPostEventLearningContext(userId: string, eventType?: string): Promise<string>;
export declare const postEventLearning: {
    scheduleEventFollowUps: typeof scheduleEventFollowUps;
    getDueFollowUps: typeof getDueFollowUps;
    recordLearning: typeof recordLearning;
    getApplicableLearnings: typeof getApplicableLearnings;
    getLearningSummary: typeof getLearningSummary;
    buildPostEventLearningContext: typeof buildPostEventLearningContext;
    loadLearningProfile: typeof loadLearningProfile;
};
export default postEventLearning;
//# sourceMappingURL=post-event-learning.d.ts.map