/**
 * Topic Tracker
 *
 * Tracks conversation topics for multi-threading and context awareness.
 * Enables Jack to circle back to topics and maintain conversation coherence.
 */
/**
 * Topic categories
 */
export type TopicCategory = 'financial' | 'personal' | 'emotional' | 'market' | 'planning' | 'education' | 'general';
/**
 * A tracked topic
 */
export interface Topic {
    id: string;
    name: string;
    category: TopicCategory;
    firstMentioned: Date;
    lastMentioned: Date;
    mentionCount: number;
    resolved: boolean;
    priority: 'high' | 'medium' | 'low';
    relatedTopics: string[];
    context: string[];
    needsFollowUp: boolean;
}
/**
 * Topic extraction result
 */
export interface TopicExtractionResult {
    detected: string[];
    category: TopicCategory;
    isNewTopic: boolean;
    isTopicShift: boolean;
    suggestedTransition?: string;
}
/**
 * Topic Tracker class
 */
export declare class TopicTracker {
    private topics;
    private topicStack;
    private lastTopic;
    /**
     * Extract and track topics from text
     */
    extract(text: string): TopicExtractionResult;
    /**
     * Track a topic
     */
    private trackTopic;
    /**
     * Get current topic
     */
    getCurrentTopic(): Topic | null;
    /**
     * Get all active topics (not resolved)
     */
    getActiveTopics(): Topic[];
    /**
     * Get topics needing follow-up
     */
    getTopicsNeedingFollowUp(): Topic[];
    /**
     * Get topics that haven't been discussed recently
     */
    getNeglectedTopics(thresholdMinutes?: number): Topic[];
    /**
     * Mark a topic as resolved
     */
    resolveTopic(name: string): boolean;
    /**
     * Mark a topic as needing follow-up
     */
    markForFollowUp(name: string): boolean;
    /**
     * Pop topic from stack (go back to previous topic)
     */
    popTopic(): Topic | null;
    /**
     * Get topic stack for context
     */
    getTopicStack(): string[];
    /**
     * Get related topics for current conversation
     */
    getSuggestedTopics(): string[];
    /**
     * Generate circle-back suggestions
     */
    getCircleBackSuggestions(): Array<{
        topic: Topic;
        suggestion: string;
    }>;
    /**
     * Get conversation summary by topics
     */
    getTopicSummary(): string;
    /**
     * Clear all tracked topics
     */
    clear(): void;
    /**
     * Detect a topic change (compatibility with topic-change-detector)
     */
    detectTopicChange(text: string): {
        detected: boolean;
        previousTopic?: string;
        newTopic?: string;
        confidence: number;
        transitionPhrase?: string;
    };
    /**
     * Get simple topic history (compatibility with conversational-memory)
     */
    getSimpleTopicHistory(): string[];
    /**
     * Check if returning to a previous topic
     */
    isReturningToTopic(topic: string): boolean;
}
/**
 * Get the default topic tracker
 */
export declare function getTopicTracker(): TopicTracker;
/**
 * Quick extract function
 */
export declare function extractTopics(text: string): TopicExtractionResult;
export default TopicTracker;
//# sourceMappingURL=topic.d.ts.map