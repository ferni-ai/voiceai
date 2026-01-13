/**
 * Conversation Preparation Intelligence - Better Than Human v4
 *
 * > "We know what you need to talk about before you do."
 *
 * SUPERHUMAN CAPABILITY: Predict what users will need to discuss
 * in their next conversation, and prepare accordingly.
 *
 * A human friend might have a sense of "I should check in about that thing"
 * but can't:
 * - Systematically predict topic probability
 * - Know the emotional state they'll likely be in
 * - Prepare the right warmup topics
 * - Identify what THEY won't raise but should
 *
 * This module provides:
 * - Topic prediction based on patterns
 * - Emotional state prediction
 * - Needs prediction (validation, advice, challenge, etc.)
 * - Proactive topic suggestions
 * - Conversation flow optimization
 *
 * @module intelligence/predictive/conversation-preparation
 */
/** Conversation needs types */
export type ConversationNeed = 'validation' | 'advice' | 'challenge' | 'celebration' | 'presence' | 'processing' | 'venting' | 'planning' | 'reflection' | 'connection' | 'reassurance' | 'accountability';
/** Predicted topic for next conversation */
export interface PredictedTopic {
    topic: string;
    category: TopicCategory;
    /** Probability they'll bring this up */
    probability: number;
    /** Expected emotional intensity (0-1) */
    emotionalIntensity: number;
    /** Why we predict this */
    reasoning: string[];
    /** What context we should have ready */
    preparationNeeded: string[];
    /** Is this something they might minimize? */
    likelyToMinimize: boolean;
    /** Last time they discussed this */
    lastDiscussed?: Date;
    /** Unresolved from last time */
    unresolvedAspects: string[];
}
export type TopicCategory = 'work' | 'relationships' | 'health' | 'family' | 'goals' | 'habits' | 'emotions' | 'decisions' | 'events' | 'self_development' | 'finances' | 'creativity' | 'spirituality' | 'social' | 'past' | 'future';
/** Full conversation preparation */
export interface ConversationPreparation {
    userId: string;
    generatedAt: Date;
    /** Topics they're likely to bring up */
    predictedTopics: PredictedTopic[];
    /** Their likely emotional state */
    predictedEmotionalState: {
        primaryEmotion: string;
        intensity: number;
        stability: 'stable' | 'volatile' | 'unknown';
        confidence: number;
    };
    /** What they'll likely need from the conversation */
    predictedNeeds: Array<{
        need: ConversationNeed;
        probability: number;
        reasoning: string;
    }>;
    /** Suggested conversation opening */
    suggestedOpening: {
        phrase: string;
        rationale: string;
        alternatives: string[];
    };
    /** Topics THEY won't raise but should */
    topicsToProactivelyRaise: Array<{
        topic: string;
        why: string;
        approach: string;
        timing: 'early' | 'middle' | 'when_ready' | 'end';
        sensitivity: 'low' | 'moderate' | 'high';
    }>;
    /** Safe warmup topics to build to deeper ones */
    warmupTopics: string[];
    /** What to avoid */
    topicsToAvoid: Array<{
        topic: string;
        reason: string;
    }>;
    /** Context to keep in mind */
    relevantContext: Array<{
        fact: string;
        importance: number;
        shouldMention: boolean;
    }>;
    /** Optimal conversation pacing */
    pacing: {
        recommendedLength: 'brief' | 'normal' | 'extended';
        energyLevel: 'calm' | 'moderate' | 'energetic';
        depthLevel: 'surface' | 'moderate' | 'deep';
    };
    /** Confidence in this preparation */
    overallConfidence: number;
}
/** Topic history entry */
interface TopicHistoryEntry {
    topic: string;
    category: TopicCategory;
    timestamp: number;
    emotionalIntensity: number;
    resolved: boolean;
    unresolvedAspects: string[];
    followUpNeeded: boolean;
    userInitiated: boolean;
}
/** Conversation outcome for learning */
interface ConversationOutcome {
    timestamp: number;
    topicsDiscussed: string[];
    needsMet: ConversationNeed[];
    emotionalStateObserved: string;
    satisfactionLevel: number;
    predictedTopicsHit: string[];
    unexpectedTopics: string[];
}
interface TemporalPattern {
    dayOfWeek?: number;
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    weekOfMonth?: number;
    likelyTopics: string[];
    likelyNeeds: ConversationNeed[];
    confidence: number;
}
/**
 * Record a topic that was discussed
 *
 * @param userId - User ID
 * @param entry - Topic entry
 */
export declare function recordTopicDiscussion(userId: string, entry: Omit<TopicHistoryEntry, 'timestamp'>): void;
/**
 * Record conversation needs that were expressed
 *
 * @param userId - User ID
 * @param need - Primary need observed
 * @param context - Optional context
 */
export declare function recordConversationNeed(userId: string, need: ConversationNeed, context?: string): void;
/**
 * Record conversation outcome for learning
 *
 * @param userId - User ID
 * @param outcome - Conversation outcome
 */
export declare function recordConversationOutcome(userId: string, outcome: Omit<ConversationOutcome, 'timestamp'>): void;
/**
 * Record a temporal pattern observed
 *
 * @param userId - User ID
 * @param pattern - Temporal pattern
 */
export declare function recordTemporalPattern(userId: string, pattern: Omit<TemporalPattern, 'confidence'>): void;
/**
 * Generate conversation preparation for a user
 *
 * @param userId - User ID
 * @param context - Optional context about upcoming conversation
 * @returns Full conversation preparation
 */
export declare function prepareForConversation(userId: string, context?: {
    scheduledTime?: Date;
    knownTopic?: string;
    previousConversationEnd?: string;
    userMood?: string;
    externalEvents?: string[];
}): ConversationPreparation;
/**
 * Build conversation preparation context for LLM injection
 *
 * @param userId - User ID
 * @returns Context string for prompt injection
 */
export declare function buildConversationPrepContext(userId: string): string;
export declare const conversationPreparation: {
    recordTopicDiscussion: typeof recordTopicDiscussion;
    recordConversationNeed: typeof recordConversationNeed;
    recordConversationOutcome: typeof recordConversationOutcome;
    recordTemporalPattern: typeof recordTemporalPattern;
    prepareForConversation: typeof prepareForConversation;
    buildConversationPrepContext: typeof buildConversationPrepContext;
};
export default conversationPreparation;
//# sourceMappingURL=conversation-preparation.d.ts.map