/**
 * Topic Detection
 *
 * Handles topic detection and transition phrase generation.
 * Delegates to the canonical TopicTracker for core detection.
 *
 * @module conversation/conversational-memory/topic-detection
 */

import { getTopicTracker } from '../../intelligence/topic-tracker.js';
import { getContentWithFallback, type ContentContext } from '../../services/llm-dynamic-content.js';

import type { TopicChange } from './types.js';

// ============================================================================
// TOPIC DETECTOR
// ============================================================================

export class TopicDetector {
  private currentTopic: string | null = null;
  private topicHistory: string[] = [];

  /**
   * Detect topic from text
   * Delegates to the canonical TopicTracker for consistent topic detection
   */
  detectTopic(text: string): string | null {
    const tracker = getTopicTracker();
    const result = tracker.extract(text);
    return result.detected[0] || null;
  }

  /**
   * Analyze message for topic change
   */
  analyzeTopicChange(userMessage: string): TopicChange {
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
    const transitionPhrase =
      result.transitionPhrase ||
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
  getTopicTransitionPhrase(fromTopic: string, toTopic: string): string {
    // Try LLM-generated transition first (from cache)
    const llmContext: ContentContext = {
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
    const specificTransitions: Record<string, string[]> = {
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
      return options[Math.floor(Math.random() * options.length)];
    }

    const generic = [
      "Oh, okay—let's talk about that.",
      'Right, I hear you.',
      "Yes, that's important too.",
      "Okay, I'm with you.",
    ];
    return generic[Math.floor(Math.random() * generic.length)];
  }

  /**
   * Generate a "circling back" phrase for a topic
   */
  generateCircleBack(topic: string): string {
    const phrases = [
      `Going back to ${topic} for a moment...`,
      `I wanted to return to something you mentioned about ${topic}...`,
      `You know, I keep thinking about what you said about ${topic}...`,
      `Earlier you brought up ${topic}—can we revisit that?`,
      `Before we move on, I want to circle back to ${topic}...`,
      `That reminds me—we were talking about ${topic}...`,
    ];

    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  /**
   * Get current detected topic
   */
  getCurrentTopic(): string | null {
    return this.currentTopic;
  }

  /**
   * Get topic history
   */
  getTopicHistory(): string[] {
    return [...this.topicHistory];
  }

  /**
   * Check if returning to a previous topic
   */
  isReturningToTopic(topic: string): boolean {
    return this.topicHistory.includes(topic) && this.currentTopic !== topic;
  }

  /**
   * Reset topic state
   */
  reset(): void {
    this.currentTopic = null;
    this.topicHistory = [];
  }
}

