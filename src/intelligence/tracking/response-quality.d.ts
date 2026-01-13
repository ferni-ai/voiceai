/**
 * Response Quality Tracker
 *
 * Learns what kind of responses resonate with each user by tracking:
 * - User engagement signals (expanded reply, short answer, topic change)
 * - Response types that work (stories, advice, questions, humor)
 * - Topics that generate positive engagement
 * - Response lengths that match user preferences
 *
 * Over time, Jack learns: "This user loves stories but wants brief advice"
 */
/**
 * Type of response Jack gave
 */
export type ResponseType = 'story' | 'advice' | 'question' | 'humor' | 'empathy' | 'explanation' | 'encouragement' | 'reflection' | 'factual' | 'mixed';
/**
 * User's reaction to Jack's response
 */
export type UserReaction = 'highly_engaged' | 'engaged' | 'neutral' | 'disengaged' | 'negative' | 'clarification' | 'emotional' | 'continued' | 'redirected';
/**
 * A single response quality signal
 */
export interface ResponseSignal {
    id: string;
    timestamp: Date;
    responseType: ResponseType;
    responseLength: 'brief' | 'moderate' | 'lengthy';
    topic: string;
    hadStory: boolean;
    hadHumor: boolean;
    hadQuestion: boolean;
    hadAdvice: boolean;
    userReaction: UserReaction;
    userResponseLength: number;
    userAskedFollowUp: boolean;
    userShowedEmotion: boolean;
    engagementScore: number;
    conversationPhase: string;
    emotionalContext: string;
}
/**
 * Aggregated preferences learned over time
 */
export interface LearnedResponsePreferences {
    storyEffectiveness: number;
    adviceEffectiveness: number;
    humorEffectiveness: number;
    questionEffectiveness: number;
    empathyEffectiveness: number;
    explanationEffectiveness: number;
    preferredResponseLength: 'brief' | 'moderate' | 'lengthy';
    lengthConfidence: number;
    highEngagementTopics: string[];
    lowEngagementTopics: string[];
    likesStories: boolean;
    likesHumor: boolean;
    likesQuestions: boolean;
    prefersDirectAdvice: boolean;
    needsMoreEmpathy: boolean;
    totalSignals: number;
    lastUpdated: Date;
}
/**
 * Response quality tracker per user
 */
export interface UserResponseQuality {
    userId: string;
    signals: ResponseSignal[];
    preferences: LearnedResponsePreferences;
    avgEngagementScore: number;
    bestResponseType: ResponseType;
    worstResponseType: ResponseType;
}
export declare class ResponseQualityTracker {
    private signals;
    private userId;
    constructor(userId: string, existingSignals?: ResponseSignal[]);
    /**
     * Analyze Jack's response to determine its type
     */
    analyzeResponse(response: string): {
        type: ResponseType;
        length: 'brief' | 'moderate' | 'lengthy';
        hadStory: boolean;
        hadHumor: boolean;
        hadQuestion: boolean;
        hadAdvice: boolean;
    };
    /**
     * Analyze user's reaction to determine engagement
     */
    analyzeUserReaction(userResponse: string, previousTopic: string, emotion?: {
        primary: string;
        intensity: number;
    }): {
        reaction: UserReaction;
        engagementScore: number;
        askedFollowUp: boolean;
        showedEmotion: boolean;
    };
    /**
     * Record a response quality signal
     */
    recordSignal(jackResponse: string, userResponse: string, topic: string, conversationPhase: string, emotion?: {
        primary: string;
        intensity: number;
    }): ResponseSignal;
    /**
     * Calculate learned preferences from signals
     */
    calculatePreferences(): LearnedResponsePreferences;
    /**
     * Get default preferences for new users
     */
    private getDefaultPreferences;
    /**
     * Get response guidance based on learned preferences
     */
    getResponseGuidance(): string;
    /**
     * Get all signals for persistence
     */
    getSignals(): ResponseSignal[];
    /**
     * Get full quality data for persistence
     */
    getQualityData(): UserResponseQuality;
}
export declare function getResponseQualityTracker(userId: string, existingSignals?: ResponseSignal[]): ResponseQualityTracker;
export declare function removeResponseQualityTracker(userId: string): void;
export default ResponseQualityTracker;
//# sourceMappingURL=response-quality.d.ts.map