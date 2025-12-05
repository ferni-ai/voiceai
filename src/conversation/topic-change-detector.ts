/**
 * Topic Change Detector
 *
 * @deprecated This module delegates to intelligence/topic-tracker.ts
 * Use TopicTracker directly for new code.
 * 
 * This wrapper maintains backward compatibility while using the canonical
 * topic tracking implementation internally.
 *
 * See: src/intelligence/topic-tracker.ts for the canonical implementation.
 */

import { getLogger } from '../utils/safe-logger.js';
import { getTopicTracker, type TopicTracker } from '../intelligence/topic-tracker.js';

// ============================================================================
// TYPES (kept for backward compatibility)
// ============================================================================

export interface TopicChangeResult {
  detected: boolean;
  previousTopic?: string;
  newTopic?: string;
  confidence: number;
  transitionPhrase?: string;
}

export interface TopicRecord {
  topic: string;
  startedAt: number;
  messageCount: number;
}

// ============================================================================
// TRANSITION PHRASES (kept for this module's specific phrases)
// ============================================================================

const TRANSITION_PHRASES: Map<string, string[]> = new Map([
  [
    'investing',
    [
      "Investing - now we're talking!",
      "Let's dig into the investment side.",
      'Good, the investing piece is important.',
    ],
  ],
  [
    'retirement',
    [
      'Retirement planning - my favorite topic.',
      "Let's talk about your future self.",
      'Ah, retirement - the big picture.',
    ],
  ],
  [
    'debt',
    [
      "Debt is worth addressing. Let's talk strategy.",
      'Good to tackle debt head-on.',
      "Debt management - let's figure this out.",
    ],
  ],
  [
    'budgeting',
    [
      'Budgeting is the foundation. Good call.',
      "Let's look at the spending side.",
      'A budget gives you control.',
    ],
  ],
  [
    'emotions',
    [
      'I appreciate you sharing how you feel.',
      "It's important to acknowledge these feelings.",
      'Thank you for being open about this.',
    ],
  ],
  [
    'family',
    [
      'Family considerations are important.',
      "Let's talk about the family aspect.",
      'Family definitely factors into this.',
    ],
  ],
  [
    'career',
    [
      'Career decisions have big implications.',
      "Let's discuss the career angle.",
      'Work and career - important to consider.',
    ],
  ],
  [
    'health',
    [
      'Health is wealth, as they say.',
      "Let's factor in the health side.",
      'Health considerations matter.',
    ],
  ],
  [
    'taxes',
    [
      'Taxes are always a factor.',
      "Let's think about the tax implications.",
      'Good to consider the tax angle.',
    ],
  ],
  [
    'goals',
    [
      "Love talking about goals. What's on your mind?",
      "Goals give us direction. Let's explore.",
      'Setting goals is powerful.',
    ],
  ],
  [
    'default',
    [
      "Interesting shift. Let's explore that.",
      "Good point - let's talk about that.",
      "Sure, let's go there.",
    ],
  ],
]);

// ============================================================================
// TOPIC CHANGE DETECTOR (Delegating Wrapper)
// ============================================================================

/**
 * @deprecated Use TopicTracker from intelligence/topic-tracker.ts directly
 */
export class TopicChangeDetector {
  private tracker: TopicTracker;
  private topicHistory: TopicRecord[] = [];

  constructor() {
    this.tracker = getTopicTracker();
    getLogger().debug('TopicChangeDetector initialized (delegating to TopicTracker)');
  }

  /**
   * Analyze a message for topic change
   * Delegates to TopicTracker.detectTopicChange()
   */
  analyzeForTopicChange(message: string): TopicChangeResult {
    // Use the canonical topic tracker's detection
    const result = this.tracker.detectTopicChange(message);
    
    // Track history for this wrapper's API
    if (result.detected && result.newTopic) {
      this.topicHistory.push({
        topic: result.newTopic,
        startedAt: Date.now(),
        messageCount: 1,
      });
      
      // Keep history bounded
      if (this.topicHistory.length > 20) {
        this.topicHistory = this.topicHistory.slice(-20);
      }
    } else if (this.topicHistory.length > 0) {
      // Increment message count for current topic
      this.topicHistory[this.topicHistory.length - 1].messageCount++;
    }

    // Add transition phrase if topic changed
    let transitionPhrase = result.transitionPhrase;
    if (result.detected && result.newTopic && !transitionPhrase) {
      transitionPhrase = this.getTransitionPhrase(result.newTopic);
    }

    return {
      detected: result.detected,
      previousTopic: result.previousTopic,
      newTopic: result.newTopic,
      confidence: result.confidence,
      transitionPhrase,
    };
  }

  /**
   * Get current topic
   */
  getCurrentTopic(): string | null {
    const topic = this.tracker.getCurrentTopic();
    return topic?.name || null;
  }

  /**
   * Get topic history (list of topic names)
   */
  getTopicHistory(): string[] {
    return this.tracker.getSimpleTopicHistory();
  }

  /**
   * Set current topic manually
   * Note: This only affects this wrapper's history, not the canonical tracker
   */
  setTopic(topic: string): void {
    const current = this.getCurrentTopic();
    if (topic !== current) {
      // Extract through the tracker to register it
      this.tracker.extract(`I want to discuss ${topic}`);
      
      this.topicHistory.push({
        topic,
        startedAt: Date.now(),
        messageCount: 1,
      });
    }
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.tracker.clear();
    this.topicHistory = [];
    getLogger().debug('TopicChangeDetector reset');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private getTransitionPhrase(topic: string): string {
    // Map to known phrase categories
    const phraseKey = this.mapTopicToPhraseKey(topic);
    const phrases = TRANSITION_PHRASES.get(phraseKey) || TRANSITION_PHRASES.get('default')!;
    const index = Math.floor(Math.random() * phrases.length);
    return phrases[index];
  }

  private mapTopicToPhraseKey(topic: string): string {
    const topicLower = topic.toLowerCase();
    
    // Map topic names to phrase keys
    const mappings: Record<string, string> = {
      retirement: 'retirement',
      investments: 'investing',
      investing: 'investing',
      debt: 'debt',
      budgeting: 'budgeting',
      savings: 'budgeting',
      emotions: 'emotions',
      personal: 'emotions',
      family: 'family',
      career: 'career',
      health: 'health',
      taxes: 'taxes',
      goals: 'goals',
    };

    return mappings[topicLower] || 'default';
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultDetector: TopicChangeDetector | null = null;

/**
 * Get global topic change detector
 * @deprecated Use getTopicTracker() from intelligence/topic-tracker.ts
 */
export function getTopicChangeDetector(): TopicChangeDetector {
  if (!defaultDetector) {
    defaultDetector = new TopicChangeDetector();
  }
  return defaultDetector;
}

/**
 * Reset global topic change detector
 */
export function resetTopicChangeDetector(): void {
  if (defaultDetector) {
    defaultDetector.reset();
  }
  defaultDetector = null;
}
