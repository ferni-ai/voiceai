/**
 * Conversation Pattern Analyzer
 *
 * Learns user habits and patterns over time:
 * - When they typically call (morning person? night owl?)
 * - How long they like to chat
 * - Typical conversation flow (small talk → topic → wrap up)
 * - Topic sequences that work well
 * - Engagement patterns throughout conversation
 *
 * Jack learns: "This user calls Monday mornings, likes 10-min chats,
 *              always starts with weather then moves to portfolio"
 */
/**
 * Time of day buckets
 */
export type TimeOfDay = 'early_morning' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night' | 'late_night';
/**
 * Day of week
 */
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
/**
 * Conversation duration bucket
 */
export type DurationBucket = 'very_short' | 'short' | 'medium' | 'long' | 'extended';
/**
 * Opening style detected
 */
export type OpeningStyle = 'quick_question' | 'social_greeting' | 'direct_topic' | 'check_in' | 'anxious_start' | 'casual_chat';
/**
 * A single conversation session record
 */
export interface ConversationSession {
    id: string;
    userId: string;
    startedAt: Date;
    endedAt: Date;
    dayOfWeek: DayOfWeek;
    timeOfDay: TimeOfDay;
    durationMinutes: number;
    durationBucket: DurationBucket;
    openingStyle: OpeningStyle;
    topicSequence: string[];
    peakEngagementTopics: string[];
    engagementCurve: [number, number, number, number];
    endedNaturally: boolean;
    hadGoodbye: boolean;
    userSatisfaction: 'positive' | 'neutral' | 'negative' | 'unknown';
    followUpScheduled: boolean;
}
/**
 * Learned patterns from conversation history
 */
export interface LearnedConversationPatterns {
    preferredTimes: TimeOfDay[];
    preferredDays: DayOfWeek[];
    avgTimeBetweenConversations: number;
    avgDuration: number;
    preferredDuration: DurationBucket;
    hasTimeConstraints: boolean;
    typicalOpeningStyle: OpeningStyle;
    commonOpeningPhrases: string[];
    commonTopicSequences: string[][];
    preferredFirstTopic: string;
    topicsThatLeadToEngagement: string[];
    typicalEngagementCurve: [number, number, number, number];
    peakEngagementTime: 'early' | 'middle' | 'late';
    engagementDropoffPoint?: number;
    likesSmallTalkFirst: boolean;
    prefersQuickConversations: boolean;
    oftenReturnsToTopic: boolean;
    totalSessions: number;
    lastUpdated: Date;
}
/**
 * Prediction for next conversation
 */
export interface ConversationPrediction {
    likelyTimeOfDay: TimeOfDay;
    likelyDuration: DurationBucket;
    likelyOpeningStyle: OpeningStyle;
    suggestedFirstTopic: string;
    suggestedTopicFlow: string[];
    warnings: string[];
}
export declare class ConversationPatternAnalyzer {
    private sessions;
    private userId;
    private currentSession;
    constructor(userId: string, existingSessions?: ConversationSession[]);
    private getTimeOfDay;
    private getDayOfWeek;
    private getDurationBucket;
    private detectOpeningStyle;
    /**
     * Start tracking a new conversation session
     */
    startSession(firstUserMessage: string): void;
    /**
     * Record a topic discussed
     */
    recordTopic(topic: string, engagement: number): void;
    /**
     * Update engagement at a point in conversation
     */
    recordEngagement(minutesIn: number, totalExpectedMinutes: number, engagement: number): void;
    /**
     * End the current session
     */
    endSession(options: {
        endedNaturally: boolean;
        hadGoodbye: boolean;
        userSatisfaction: 'positive' | 'neutral' | 'negative' | 'unknown';
        followUpScheduled: boolean;
    }): ConversationSession | null;
    /**
     * Analyze all sessions to learn patterns
     */
    analyzePatterns(): LearnedConversationPatterns;
    /**
     * Get default patterns for new users
     */
    private getDefaultPatterns;
    /**
     * Predict what the next conversation will be like
     */
    predictNextConversation(): ConversationPrediction;
    /**
     * Get pattern guidance for prompt
     */
    getPatternGuidance(): string;
    /**
     * Get all sessions for persistence
     */
    getSessions(): ConversationSession[];
}
export declare function getConversationPatternAnalyzer(userId: string, existingSessions?: ConversationSession[]): ConversationPatternAnalyzer;
export declare function removeConversationPatternAnalyzer(userId: string): void;
export default ConversationPatternAnalyzer;
//# sourceMappingURL=conversation-patterns.d.ts.map