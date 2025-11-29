/**
 * Topic Change Detector
 *
 * Detects when the user changes topics mid-conversation.
 * Helps Jack acknowledge the shift and transition smoothly.
 */

import { log } from '@livekit/agents';

export interface TopicChange {
  detected: boolean;
  previousTopic?: string;
  newTopic?: string;
  confidence: number;
  transitionPhrase?: string;
}

export class TopicChangeDetector {
  private currentTopic: string | null = null;
  private topicHistory: string[] = [];
  private topicKeywords: Map<string, string[]> = new Map();

  constructor() {
    // Initialize topic keyword mappings
    this.initializeTopicKeywords();
  }

  /**
   * Initialize topic keyword mappings for detection
   */
  private initializeTopicKeywords(): void {
    this.topicKeywords.set('investing', [
      'invest', 'stock', 'bond', 'portfolio', 'market', 'fund', 'etf',
      'dividend', 'return', 'allocation', 'diversification', 'index'
    ]);

    this.topicKeywords.set('retirement', [
      'retire', 'retirement', '401k', 'ira', 'pension', 'savings',
      'social security', 'nest egg', 'retirement plan'
    ]);

    this.topicKeywords.set('debt', [
      'debt', 'loan', 'credit card', 'mortgage', 'owe', 'payment',
      'interest', 'payoff', 'consolidate', 'borrow'
    ]);

    this.topicKeywords.set('budgeting', [
      'budget', 'spending', 'expense', 'income', 'save', 'saving',
      'track', 'afford', 'cost', 'money management'
    ]);

    this.topicKeywords.set('emotions', [
      'feel', 'feeling', 'worried', 'anxious', 'scared', 'stressed',
      'overwhelmed', 'frustrated', 'hopeful', 'confident', 'nervous'
    ]);

    this.topicKeywords.set('family', [
      'family', 'spouse', 'wife', 'husband', 'children', 'kids',
      'parent', 'mother', 'father', 'grandchildren', 'marriage'
    ]);

    this.topicKeywords.set('career', [
      'job', 'work', 'career', 'employer', 'salary', 'income',
      'promotion', 'layoff', 'unemployment', 'business'
    ]);

    this.topicKeywords.set('health', [
      'health', 'medical', 'insurance', 'doctor', 'hospital',
      'illness', 'care', 'medication', 'healthcare'
    ]);
  }

  /**
   * Detect topic from text
   */
  private detectTopic(text: string): string | null {
    const textLower = text.toLowerCase();
    const scores = new Map<string, number>();

    // Score each topic based on keyword matches
    for (const [topic, keywords] of this.topicKeywords.entries()) {
      let score = 0;
      for (const keyword of keywords) {
        if (textLower.includes(keyword)) {
          score++;
        }
      }
      if (score > 0) {
        scores.set(topic, score);
      }
    }

    if (scores.size === 0) return null;

    // Return topic with highest score
    let maxScore = 0;
    let detectedTopic = null;
    for (const [topic, score] of scores.entries()) {
      if (score > maxScore) {
        maxScore = score;
        detectedTopic = topic;
      }
    }

    return detectedTopic;
  }

  /**
   * Analyze message for topic change
   */
  analyzeForTopicChange(userMessage: string): TopicChange {
    const newTopic = this.detectTopic(userMessage);

    // No topic detected
    if (!newTopic) {
      return {
        detected: false,
        confidence: 0,
      };
    }

    // First topic in conversation
    if (!this.currentTopic) {
      this.currentTopic = newTopic;
      this.topicHistory.push(newTopic);
      return {
        detected: false,
        confidence: 0.5,
      };
    }

    // Same topic - no change
    if (newTopic === this.currentTopic) {
      return {
        detected: false,
        previousTopic: this.currentTopic,
        newTopic: this.currentTopic,
        confidence: 0,
      };
    }

    // Topic changed!
    log().info('Topic change detected', {
      from: this.currentTopic,
      to: newTopic,
    });

    const previousTopic = this.currentTopic;
    this.currentTopic = newTopic;
    this.topicHistory.push(newTopic);

    return {
      detected: true,
      previousTopic,
      newTopic,
      confidence: 0.8,
      transitionPhrase: this.getTransitionPhrase(previousTopic, newTopic),
    };
  }

  /**
   * Get natural transition phrase for topic change
   */
  getTransitionPhrase(fromTopic: string, toTopic: string): string {
    // Generic transitions
    const genericTransitions = [
      "Oh, okay—let's talk about that.",
      "Right, right. I hear you.",
      "Yes, that's important too.",
      "Okay, I'm with you.",
      "Let me switch gears with you here.",
      "Alright, let's address that.",
    ];

    // Context-specific transitions
    const specificTransitions: Record<string, string[]> = {
      'emotions': [
        "I hear the emotion in your voice. Let's talk about how you're feeling.",
        "It sounds like this is weighing on you. Tell me more about that.",
        "I can sense this is affecting you. Let's explore that.",
      ],
      'family': [
        "Family dynamics matter a lot here. Let's talk about that.",
        "This is about more than money—it's about your family. Tell me more.",
      ],
      'debt': [
        "Okay, let's tackle the debt situation.",
        "Debt can be stressful. Let's work through this together.",
      ],
      'retirement': [
        "Retirement planning is crucial. Let's focus on that.",
        "Your retirement security is what matters most. Let's talk about that.",
      ],
    };

    // Try to use specific transition for new topic
    if (specificTransitions[toTopic]) {
      const options = specificTransitions[toTopic];
      return options[Math.floor(Math.random() * options.length)];
    }

    // Fall back to generic transition
    return genericTransitions[Math.floor(Math.random() * genericTransitions.length)];
  }

  /**
   * Check if returning to previous topic
   */
  isReturningToTopic(topic: string): boolean {
    return this.topicHistory.includes(topic) && this.currentTopic !== topic;
  }

  /**
   * Get current topic
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
   * Get callback phrase for topic switching
   */
  getTopicCallbackPhrase(topic: string): string | null {
    if (!this.isReturningToTopic(topic)) {
      return null;
    }

    const callbacks = [
      `Going back to what you said about ${topic}...`,
      `Earlier you mentioned ${topic}. Let me add something about that.`,
      `You know, about ${topic}—I wanted to say...`,
      `Coming back to ${topic} for a moment...`,
    ];

    return callbacks[Math.floor(Math.random() * callbacks.length)];
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.currentTopic = null;
    this.topicHistory = [];
  }
}

// Singleton instance
let defaultDetector: TopicChangeDetector | null = null;

/**
 * Get global topic change detector
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
}
