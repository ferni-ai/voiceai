/**
 * Intelligent Conversation Starters
 *
 * Generates context-aware, personalized conversation openers
 * based on trust history, recent events, and relationship stage.
 *
 * Philosophy: A great friend doesn't just say "how are you?" -
 * they remember what matters and ask the right questions.
 *
 * Starter Types:
 * - Follow-up: "How did that thing go?"
 * - Callback: "Remember when you mentioned X?"
 * - Celebration: "I bet you crushed that presentation!"
 * - Gentle check-in: "Been thinking about you"
 * - Growth acknowledgment: "I've noticed something..."
 * - Random warmth: "Just wanted to say..."
 *
 * @module ConversationStarters
 */
export type StarterType = 'follow_up' | 'callback' | 'celebration' | 'gentle_check_in' | 'growth' | 'random_warmth' | 'time_sensitive' | 'milestone';
export interface ConversationStarter {
    id: string;
    type: StarterType;
    text: string;
    ssml: string;
    context: string;
    confidence: number;
    priority: number;
    relevantUntil?: Date;
    metadata: {
        triggerTopic?: string;
        triggerEvent?: string;
        callbackMomentId?: string;
        growthPatternId?: string;
    };
}
export interface UserContext {
    userId: string;
    lastSession?: Date;
    recentTopics?: string[];
    pendingFollowUps?: PendingFollowUp[];
    upcomingEvents?: UpcomingEvent[];
    recentWins?: string[];
    currentStruggles?: string[];
    growthPatterns?: GrowthPattern[];
    callbackMoments?: CallbackMoment[];
    relationshipStage?: 'new' | 'building' | 'established' | 'deep' | 'flourishing';
    lastEmotionalState?: string;
    userName?: string;
}
export interface PendingFollowUp {
    id: string;
    topic: string;
    question: string;
    mentionedAt: Date;
    importance: 'high' | 'medium' | 'low';
    category: string;
}
export interface UpcomingEvent {
    id: string;
    description: string;
    date: Date;
    type: 'deadline' | 'appointment' | 'milestone' | 'event';
    userAnticipation?: 'excited' | 'nervous' | 'dreading' | 'neutral';
}
export interface GrowthPattern {
    id: string;
    type: string;
    description: string;
    reflectedYet: boolean;
}
export interface CallbackMoment {
    id: string;
    type: string;
    content: string;
    strength: number;
    lastUsed?: Date;
}
/**
 * Generate conversation starters based on user context
 */
export declare function generateStarters(context: UserContext): ConversationStarter[];
/**
 * Get the best starter for a greeting
 */
export declare function getBestStarter(context: UserContext): ConversationStarter;
/**
 * Mark a starter as used
 */
export declare function markStarterUsed(userId: string, starterId: string, reception: 'positive' | 'neutral' | 'negative'): void;
/**
 * Generate a personalized greeting based on context
 */
export declare function generateGreeting(context: UserContext): {
    greeting: string;
    ssml: string;
    starter?: ConversationStarter;
};
declare const _default: {
    generateStarters: typeof generateStarters;
    getBestStarter: typeof getBestStarter;
    markStarterUsed: typeof markStarterUsed;
    generateGreeting: typeof generateGreeting;
};
export default _default;
//# sourceMappingURL=conversation-starters.d.ts.map