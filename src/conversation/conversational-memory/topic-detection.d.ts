/**
 * Topic Detection
 *
 * Handles topic detection and transition phrase generation.
 * Delegates to the canonical TopicTracker for core detection.
 *
 * @module conversation/conversational-memory/topic-detection
 */
import type { TopicChange } from './types.js';
export declare class TopicDetector {
    private currentTopic;
    private topicHistory;
    /**
     * Detect topic from text
     * Delegates to the canonical TopicTracker for consistent topic detection
     */
    detectTopic(text: string): string | null;
    /**
     * Analyze message for topic change
     */
    analyzeTopicChange(userMessage: string): TopicChange;
    /**
     * Get natural transition phrase for topic change
     * Now LLM-powered with template fallback!
     */
    getTopicTransitionPhrase(fromTopic: string, toTopic: string): string;
    /**
     * Generate a "circling back" phrase for a topic
     */
    generateCircleBack(topic: string): string;
    /**
     * Get current detected topic
     */
    getCurrentTopic(): string | null;
    /**
     * Get topic history
     */
    getTopicHistory(): string[];
    /**
     * Check if returning to a previous topic
     */
    isReturningToTopic(topic: string): boolean;
    /**
     * Reset topic state
     */
    reset(): void;
}
//# sourceMappingURL=topic-detection.d.ts.map