/**
 * Avoidance Prediction - Better Than Human v4
 *
 * > "We notice what you're NOT saying."
 *
 * SUPERHUMAN CAPABILITY: Predict what topics users are avoiding and when they'll surface.
 *
 * A human friend might notice "you never talk about your dad" but can't:
 * - Systematically track avoidance patterns over months
 * - Predict WHEN the topic will surface
 * - Know the OPTIMAL moment to gently inquire
 * - Understand HOW they deflect (humor, brevity, topic change)
 *
 * This module tracks:
 * - Topics that should appear based on context but don't
 * - Deflection patterns (how they avoid topics)
 * - Surfacing probability (when avoidance breaks down)
 * - Optimal approach strategies
 *
 * @module intelligence/predictive/avoidance-prediction
 */
/** Topics that can be avoided */
export type AvoidableTopic = 'relationship:parent_mother' | 'relationship:parent_father' | 'relationship:partner' | 'relationship:ex' | 'relationship:sibling' | 'relationship:friend_specific' | 'relationship:boss' | 'relationship:colleague' | 'area:career_dissatisfaction' | 'area:financial_stress' | 'area:health_concern' | 'area:mental_health' | 'area:addiction' | 'area:body_image' | 'area:sexuality' | 'area:spirituality' | 'area:mortality' | 'area:past_trauma' | 'area:regret' | 'area:loneliness' | 'area:failure' | 'area:dreams_abandoned' | 'decision:pending_breakup' | 'decision:job_change' | 'decision:relocation' | 'decision:major_purchase' | 'decision:family_planning' | 'emotion:anger' | 'emotion:grief' | 'emotion:shame' | 'emotion:jealousy' | 'emotion:resentment';
/** How they deflect from topics */
export type DeflectionStyle = 'humor' | 'topic_change' | 'brevity' | 'intellectualize' | 'generalize' | 'minimize' | 'redirect_to_other' | 'future_focus' | 'past_focus' | 'silence';
/** Record of an avoided topic */
export interface AvoidedTopic {
    topic: AvoidableTopic;
    /** When we first noticed avoidance */
    firstDetected: number;
    /** Last time they came close to the topic */
    lastDeflection: number;
    /** How many times they've deflected */
    deflectionCount: number;
    /** Primary way they deflect */
    primaryDeflectionStyle: DeflectionStyle;
    /** All observed deflection styles */
    deflectionStyles: Map<DeflectionStyle, number>;
    /** Topics that trigger deflection (adjacent topics) */
    triggerTopics: string[];
    /** Contexts where avoidance is stronger */
    strongerAvoidanceContexts: string[];
    /** Contexts where they've come closer to discussing */
    weakerAvoidanceContexts: string[];
    /** Emotional state when deflecting */
    emotionalStateOnDeflection: string[];
    /** Last actual mention (if ever) */
    lastMention?: number;
    /** How they talked about it last time */
    lastMentionContext?: string;
}
/** Prediction of when avoidance will break */
export interface AvoidanceSurfacingPrediction {
    topic: AvoidableTopic;
    /** Probability of surfacing in next conversation */
    surfacingProbability: number;
    /** Expected timeframe */
    expectedTimeframe: 'imminent' | 'days' | 'weeks' | 'months' | 'unknown';
    /** Confidence in prediction */
    confidence: number;
    /** Why we think it will surface */
    surfacingTriggers: string[];
    /** Current pressure level (0-1) */
    pressureLevel: number;
    /** Optimal conditions to approach */
    optimalApproach: {
        timing: string;
        emotionalState: string;
        leadInTopics: string[];
        phrasingStyle: string;
        toAvoid: string[];
    };
    /** Risk of bad outcome if approached wrong */
    sensitivityLevel: 'low' | 'moderate' | 'high' | 'extreme';
}
/**
 * Detect a deflection from a topic
 *
 * Call this when you notice the user avoiding something.
 *
 * @param userId - User ID
 * @param topic - Topic being avoided
 * @param style - How they deflected
 * @param context - Surrounding context
 */
export declare function recordDeflection(userId: string, topic: AvoidableTopic, style: DeflectionStyle, context?: {
    triggerTopic?: string;
    emotionalState?: string;
    conversationContext?: string;
}): void;
/**
 * Record when a user actually discusses a typically avoided topic
 *
 * This helps calibrate our predictions and track progress.
 *
 * @param userId - User ID
 * @param topic - Topic discussed
 * @param depth - How deeply they engaged (0-1)
 * @param context - Context of the discussion
 */
export declare function recordTopicEngagement(userId: string, topic: AvoidableTopic, depth: number, context?: {
    emotionalState?: string;
    conversationContext?: string;
    wasProactive?: boolean;
}): void;
/**
 * Detect avoidance from conversation analysis
 *
 * Call this after analyzing a conversation to auto-detect avoidance.
 *
 * @param userId - User ID
 * @param analysis - Conversation analysis
 */
export declare function detectAvoidanceFromConversation(userId: string, analysis: {
    topicsMentioned: string[];
    topicsExpected: string[];
    emotionDetected?: string;
    abruptTopicChanges: string[];
    briefResponses: string[];
    humorDeflections: string[];
}): AvoidableTopic[];
/**
 * Get prediction for when an avoided topic will surface
 *
 * @param userId - User ID
 * @param topic - Topic to predict for
 * @returns Surfacing prediction
 */
export declare function predictSurfacing(userId: string, topic: AvoidableTopic): AvoidanceSurfacingPrediction | null;
/**
 * Get all avoidance predictions for a user
 *
 * @param userId - User ID
 * @returns All predictions sorted by surfacing probability
 */
export declare function getAllAvoidancePredictions(userId: string): AvoidanceSurfacingPrediction[];
/**
 * Get topics that might surface in the next conversation
 *
 * @param userId - User ID
 * @param threshold - Minimum probability threshold
 * @returns Topics likely to surface
 */
export declare function getImminentTopics(userId: string, threshold?: number): AvoidanceSurfacingPrediction[];
/**
 * Build avoidance context for LLM injection
 *
 * @param userId - User ID
 * @returns Context string for prompt injection
 */
export declare function buildAvoidanceContext(userId: string): string;
export declare const avoidancePrediction: {
    recordDeflection: typeof recordDeflection;
    recordTopicEngagement: typeof recordTopicEngagement;
    detectAvoidanceFromConversation: typeof detectAvoidanceFromConversation;
    predictSurfacing: typeof predictSurfacing;
    getAllAvoidancePredictions: typeof getAllAvoidancePredictions;
    getImminentTopics: typeof getImminentTopics;
    buildAvoidanceContext: typeof buildAvoidanceContext;
};
export default avoidancePrediction;
//# sourceMappingURL=avoidance-prediction.d.ts.map