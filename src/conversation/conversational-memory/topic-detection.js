/**
 * Topic Detection
 *
 * Handles topic detection and transition phrase generation.
 * Delegates to the canonical TopicTracker for core detection.
 *
 * @module conversation/conversational-memory/topic-detection
 */
import { seededPick } from '../utils/rng.js';
import { getTopicTracker } from '../../intelligence/topic-tracker.js';
import { getContentWithFallback } from '../../services/llm-dynamic-content.js';
// ============================================================================
// TOPIC DETECTOR
// ============================================================================
export class TopicDetector {
    currentTopic = null;
    topicHistory = [];
    /**
     * Detect topic from text
     * Delegates to the canonical TopicTracker for consistent topic detection
     */
    detectTopic(text) {
        const tracker = getTopicTracker();
        const result = tracker.extract(text);
        return result.detected[0] || null;
    }
    /**
     * Analyze message for topic change
     */
    analyzeTopicChange(userMessage) {
        // Delegate to canonical TopicTracker
        const tracker = getTopicTracker();
        const result = tracker.detectTopicChange(userMessage);
        // Update local state for this module's tracking
        if (result.newTopic && result.newTopic !== this.currentTopic) {
            if (this.currentTopic) {
                this.topicHistory.push(this.currentTopic);
            }
            this.currentTopic = result.newTopic;
        }
        // Augment with our own transition phrases if not provided
        const transitionPhrase = result.transitionPhrase ||
            (result.detected && result.previousTopic && result.newTopic
                ? this.getTopicTransitionPhrase(result.previousTopic, result.newTopic)
                : undefined);
        return {
            detected: result.detected,
            previousTopic: result.previousTopic,
            newTopic: result.newTopic,
            confidence: result.confidence,
            transitionPhrase,
        };
    }
    /**
     * Get natural transition phrase for topic change
     * Now LLM-powered with template fallback!
     */
    getTopicTransitionPhrase(fromTopic, toTopic) {
        // Try LLM-generated transition first (from cache)
        const llmContext = {
            contentType: 'transition',
            topic: toTopic,
            metadata: {
                fromTopic,
                toTopic,
                transitionType: 'natural',
            },
        };
        const llmContent = getContentWithFallback(llmContext);
        if (llmContent.source === 'llm' && llmContent.content) {
            return llmContent.content;
        }
        // Fallback to specific transitions
        const specificTransitions = {
            emotions: [
                "I hear the emotion in your voice. Let's talk about how you're feeling.",
                'It sounds like this is weighing on you. Tell me more about that.',
            ],
            family: [
                "Family dynamics matter a lot here. Let's talk about that.",
                "This is about more than money—it's about your family.",
            ],
            debt: [
                "Okay, let's tackle the debt situation.",
                "Debt can be stressful. Let's work through this together.",
            ],
            retirement: [
                "Retirement planning is crucial. Let's focus on that.",
                "Your retirement security matters most. Let's talk about that.",
            ],
        };
        if (specificTransitions[toTopic]) {
            const options = specificTransitions[toTopic];
            return seededPick(`${Date.now()}:109`, options) ?? options[0];
        }
        const generic = [
            "Oh, okay—let's talk about that.",
            'Right, I hear you.',
            "Yes, that's important too.",
            "Okay, I'm with you.",
        ];
        return seededPick(`${Date.now()}:118`, generic) ?? generic[0];
    }
    /**
     * Generate a "circling back" phrase for a topic
     */
    generateCircleBack(topic) {
        const phrases = [
            `Going back to ${topic} for a moment...`,
            `I wanted to return to something you mentioned about ${topic}...`,
            `You know, I keep thinking about what you said about ${topic}...`,
            `Earlier you brought up ${topic}—can we revisit that?`,
            `Before we move on, I want to circle back to ${topic}...`,
            `That reminds me—we were talking about ${topic}...`,
        ];
        return seededPick(`${Date.now()}:134`, phrases) ?? phrases[0];
    }
    /**
     * Get current detected topic
     */
    getCurrentTopic() {
        return this.currentTopic;
    }
    /**
     * Get topic history
     */
    getTopicHistory() {
        return [...this.topicHistory];
    }
    /**
     * Check if returning to a previous topic
     */
    isReturningToTopic(topic) {
        return this.topicHistory.includes(topic) && this.currentTopic !== topic;
    }
    /**
     * Reset topic state
     */
    reset() {
        this.currentTopic = null;
        this.topicHistory = [];
    }
}
//# sourceMappingURL=topic-detection.js.map