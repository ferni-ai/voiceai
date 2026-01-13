/**
 * Adaptive Endpointing System
 *
 * Phase 23: Context-aware pause detection that adapts to:
 * - Topic weight (heavy topics = more thinking time)
 * - User speaking rhythm (fast/slow speakers)
 * - Sentence completeness (finished thought or still forming?)
 * - Emotional state (distress = more space)
 *
 * PROBLEM: Fixed 400-1200ms endpointing doesn't account for:
 * - Thinking pauses (user is formulating, not done)
 * - Topic complexity (heavy topics need more silence)
 * - User's natural speaking rhythm
 *
 * RESEARCH BASIS:
 * - Conversation analysis: Turn-taking is context-dependent
 * - Therapy research: Silence after heavy content is therapeutic
 * - UX research: Premature interruption frustrates users
 *
 * @module AdaptiveEndpointing
 */
import { detectHeavyContentKeywords as detectHeavyContent } from './utils/detection.js';
export interface EndpointingContext {
    /** How emotionally heavy is the current topic? */
    topicWeight: 'light' | 'medium' | 'heavy';
    /** User's speaking rate over recent turns (words per minute) */
    userSpeakingRate?: number;
    /** How complete does the last utterance seem? (0-1) */
    sentenceCompleteness: number;
    /** Current emotional intensity (0-1) */
    emotionalIntensity: number;
    /** What phase of conversation are we in? */
    conversationPhase: 'opening' | 'exploring' | 'supporting' | 'closing';
    /** Is the user asking a question or making a statement? */
    utteranceType?: 'question' | 'statement' | 'incomplete' | 'exclamation';
    /** Keywords that suggest more thinking time needed */
    heavyContentSignals?: string[];
    /** How long has the user been speaking this turn? */
    turnDurationMs?: number;
}
export interface EndpointingResult {
    /** Minimum silence before considering user done */
    minDelay: number;
    /** Maximum wait before assuming user is done */
    maxDelay: number;
    /** Confidence that these settings are appropriate */
    confidence: number;
    /** Explanation for debugging */
    reasoning: string[];
}
export interface UserSpeakingProfile {
    /** Average words per minute */
    averageWpm: number;
    /** Typical pause length within utterances */
    typicalPauseMs: number;
    /** How variable is their pause length? */
    pauseVariability: 'consistent' | 'variable' | 'highly_variable';
    /** Sample count for this profile */
    samples: number;
}
/**
 * Calculate optimal endpointing delays for current context.
 */
export declare function calculateEndpointingDelay(context: EndpointingContext, userId?: string): EndpointingResult;
export { detectHeavyContentKeywords as detectHeavyContent } from './utils/detection.js';
/**
 * Estimate sentence completeness from text.
 */
export declare function estimateSentenceCompleteness(text: string): number;
/**
 * Determine topic weight from context.
 */
export declare function determineTopicWeight(context: {
    topic?: string;
    emotionalIntensity?: number;
    keywords?: string[];
}): 'light' | 'medium' | 'heavy';
/**
 * Update user speaking profile from observed data.
 */
export declare function updateUserProfile(userId: string, observation: {
    wordCount: number;
    durationMs: number;
    pauseMs?: number;
}): void;
/**
 * Get user speaking profile.
 */
export declare function getUserProfile(userId: string): UserSpeakingProfile | null;
/**
 * Detect if user utterance is likely incomplete.
 */
export declare function isLikelyIncomplete(text: string): boolean;
/**
 * Get endpointing recommendation for voice agent.
 */
export declare function getEndpointingRecommendation(text: string, context?: Partial<EndpointingContext>): EndpointingResult;
export declare const adaptiveEndpointing: {
    calculate: typeof calculateEndpointingDelay;
    detectHeavyContent: typeof detectHeavyContent;
    estimateCompleteness: typeof estimateSentenceCompleteness;
    determineTopicWeight: typeof determineTopicWeight;
    updateProfile: typeof updateUserProfile;
    getProfile: typeof getUserProfile;
    isIncomplete: typeof isLikelyIncomplete;
    getRecommendation: typeof getEndpointingRecommendation;
};
export default adaptiveEndpointing;
//# sourceMappingURL=adaptive-endpointing.d.ts.map