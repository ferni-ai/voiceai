/**
 * Collective Learning Integration
 *
 * Integrates the collective learning pipeline into the voice agent flow:
 *
 * 1. COLLECTION: Record signals during conversation (response effectiveness, story usage)
 * 2. AGGREGATION: Background job aggregates signals into patterns
 * 3. INJECTION: Context builders inject learnings into prompts
 * 4. EVOLUTION: Persona adjustments are applied based on patterns
 *
 * This closes the loop described in COLLECTIVE-LEARNING.md.
 *
 * @module intelligence/collective-learning-integration
 */
import type { EmotionResult } from '../detectors/emotion.js';
export interface ConversationSignalContext {
    sessionId: string;
    userId: string;
    personaId: string;
    turnNumber: number;
    emotion: string;
    topic: string;
    relationshipStage: string;
}
export interface ResponseSignalData {
    /** What type of response was given */
    responseType: 'story' | 'advice' | 'question' | 'empathy' | 'humor' | 'explanation';
    /** Did the response include a personal share? */
    hadPersonalShare: boolean;
    /** Did the response include a persona quirk? */
    hadQuirk: boolean;
    /** Did the response reference the team? */
    hadTeamReference: boolean;
    /** Response length category */
    responseLength: 'brief' | 'moderate' | 'lengthy';
}
export interface UserReactionSignal {
    /** User engagement score (0-1) based on response length, questions asked, etc. */
    engagementScore: number;
    /** Did the user continue engaging after this response? */
    userContinued: boolean;
    /** Did the user's emotion shift positively? */
    emotionalShift: 'positive' | 'neutral' | 'negative';
    /** Did the conversation go deeper on the topic? */
    topicDepthened: boolean;
    /** Did the user ask a follow-up question? */
    askedFollowUp: boolean;
}
export interface StoryUsageSignal {
    storyId: string;
    reaction: 'moved' | 'inspired' | 'connected' | 'curious' | 'indifferent';
    engagementScore: number;
}
export interface BreakthroughSignal {
    questionPattern: string;
    context: string;
    engagementLift: number;
}
/**
 * Analyze a response to classify its type
 */
export declare function analyzeResponseType(response: string): ResponseSignalData['responseType'];
/**
 * Analyze response length category
 */
export declare function analyzeResponseLength(response: string): ResponseSignalData['responseLength'];
/**
 * Analyze user message for engagement signals
 */
export declare function analyzeUserEngagement(message: string, previousEmotion: EmotionResult | null, currentEmotion: EmotionResult): UserReactionSignal;
/**
 * Initialize collective learning for the session
 */
export declare function initializeCollectiveLearning(): void;
/**
 * Shutdown collective learning
 */
export declare function shutdownCollectiveLearning(): void;
/**
 * Record a response signal for collective learning
 */
export declare function recordResponseForLearning(context: ConversationSignalContext, response: string, reaction: UserReactionSignal, options?: {
    hadPersonalShare?: boolean;
    hadQuirk?: boolean;
    hadTeamReference?: boolean;
}): void;
/**
 * Record a story usage signal
 */
export declare function recordStoryForLearning(context: ConversationSignalContext, storyId: string, reaction: StoryUsageSignal['reaction'], engagementScore: number): void;
/**
 * Record a breakthrough question
 */
export declare function recordBreakthroughForLearning(personaId: string, topic: string, questionPattern: string, context: string, engagementLift: number): void;
/**
 * Flush all pending signals (call at end of session)
 */
export declare function flushLearningSignals(): Promise<{
    responses: number;
    stories: number;
    breakthroughs: number;
}>;
/**
 * Get collective learning recommendations for current context
 */
export declare function getCollectiveRecommendations(params: {
    personaId: string;
    emotion: string;
    topic: string;
    relationshipStage: string;
}): {
    bestStrategy?: string;
    strategyConfidence?: number;
    recommendedQuestions: string[];
    personaAdjustments: string[];
};
declare const _default: {
    initializeCollectiveLearning: typeof initializeCollectiveLearning;
    shutdownCollectiveLearning: typeof shutdownCollectiveLearning;
    recordResponseForLearning: typeof recordResponseForLearning;
    recordStoryForLearning: typeof recordStoryForLearning;
    recordBreakthroughForLearning: typeof recordBreakthroughForLearning;
    flushLearningSignals: typeof flushLearningSignals;
    getCollectiveRecommendations: typeof getCollectiveRecommendations;
    analyzeResponseType: typeof analyzeResponseType;
    analyzeResponseLength: typeof analyzeResponseLength;
    analyzeUserEngagement: typeof analyzeUserEngagement;
};
export default _default;
//# sourceMappingURL=integration.d.ts.map