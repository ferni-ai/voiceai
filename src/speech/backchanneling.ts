/**
 * Backchanneling System - GAP 1.4
 *
 * Provides verbal "nods" and listening cues during user speech.
 * Makes Jack feel present and engaged, not silent.
 */

import { log } from '@livekit/agents';
import type { EmotionResult } from '../intelligence/emotion-detector.js';
import type { TopicWeight } from './speech-context.js';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

export interface BackchannelContext {
  userHasBeenSpeaking: number; // milliseconds
  userPausedBriefly: boolean;
  userEmotion: EmotionResult;
  topicWeight: TopicWeight;
  lastBackchannelTime?: number;
}

export interface BackchannelResult {
  shouldBackchannel: boolean;
  phrase: string | null;
  timing: 'immediate' | 'after_pause' | 'never';
}

// ============================================================================
// BACKCHANNELING SYSTEM
// ============================================================================

export class BackchannelingSystem {
  private lastBackchannelTime: number = 0;
  private backchannelCount: number = 0;
  private readonly MIN_INTERVAL_MS = 5000; // Don't backchannel more than every 5 seconds

  /**
   * Determine if Jack should backchannel (verbal nod)
   */
  shouldBackchannel(context: BackchannelContext): BackchannelResult {
    const {
      userHasBeenSpeaking,
      userPausedBriefly,
      userEmotion,
      topicWeight,
      lastBackchannelTime,
    } = context;

    // Don't backchannel too frequently
    const timeSinceLastBackchannel = lastBackchannelTime
      ? Date.now() - lastBackchannelTime
      : Infinity;

    if (timeSinceLastBackchannel < this.MIN_INTERVAL_MS) {
      return {
        shouldBackchannel: false,
        phrase: null,
        timing: 'never',
      };
    }

    // User speaking for 8+ seconds without response? Backchannel!
    if (userHasBeenSpeaking > 8000 && userPausedBriefly) {
      getLogger().debug('Backchanneling: user spoke for 8+ seconds');
      return {
        shouldBackchannel: true,
        phrase: this.getBackchannel(userEmotion, topicWeight),
        timing: 'after_pause',
      };
    }

    // Heavy emotional content? Show you're present
    if (topicWeight === 'heavy' && userHasBeenSpeaking > 5000 && userPausedBriefly) {
      getLogger().debug('Backchanneling: heavy topic, user needs support');
      return {
        shouldBackchannel: true,
        phrase: this.getBackchannel(userEmotion, topicWeight),
        timing: 'after_pause',
      };
    }

    // User seems distressed? Provide support cue
    if (userEmotion.distressLevel > 0.6 && userHasBeenSpeaking > 6000) {
      getLogger().debug('Backchanneling: user distressed');
      return {
        shouldBackchannel: true,
        phrase: this.getBackchannel(userEmotion, topicWeight),
        timing: 'after_pause',
      };
    }

    return {
      shouldBackchannel: false,
      phrase: null,
      timing: 'never',
    };
  }

  /**
   * Get appropriate backchannel phrase based on emotion and topic
   */
  getBackchannel(emotion: EmotionResult, topicWeight: TopicWeight): string {
    // Heavy topics or distress - use empathetic backchannels
    if (topicWeight === 'heavy' || emotion.distressLevel > 0.5) {
      const empathyBackchannels = [
        '<volume ratio="0.7">Mm-hmm</volume>',
        '<volume ratio="0.7"><emotion value="sad">I hear you</emotion></volume>',
        '<break time="300ms"/>', // Just silence - powerful for grief
        '<volume ratio="0.7">Yes</volume>',
        '<volume ratio="0.6"><emotion value="sad">I understand</emotion></volume>',
      ];
      return empathyBackchannels[Math.floor(Math.random() * empathyBackchannels.length)];
    }

    // Neutral topics - standard listening cues
    const neutralBackchannels = [
      '<volume ratio="0.8">Right</volume>',
      '<volume ratio="0.8">I see</volume>',
      '<volume ratio="0.8">Mm-hmm</volume>',
      '<volume ratio="0.8">Go on</volume>',
      '<volume ratio="0.8">Yes</volume>',
      '<volume ratio="0.8">Okay</volume>',
    ];

    return neutralBackchannels[Math.floor(Math.random() * neutralBackchannels.length)];
  }

  /**
   * Get engagement phrase for encouraging user to continue
   */
  getEngagementPhrase(emotion: EmotionResult): string {
    if (emotion.distressLevel > 0.6) {
      const supportPhrases = [
        "I'm listening. Take your time.",
        'Tell me more about that.',
        'Go on. I want to understand.',
        "I'm here. Keep going.",
      ];
      return supportPhrases[Math.floor(Math.random() * supportPhrases.length)];
    }

    const neutralPhrases = [
      'Tell me more.',
      'Go on.',
      "I'm following.",
      'Continue.',
      "I'm listening.",
    ];

    return neutralPhrases[Math.floor(Math.random() * neutralPhrases.length)];
  }

  /**
   * Record backchannel (for tracking)
   */
  recordBackchannel(): void {
    this.lastBackchannelTime = Date.now();
    this.backchannelCount++;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      count: this.backchannelCount,
      lastTime: this.lastBackchannelTime,
    };
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.lastBackchannelTime = 0;
    this.backchannelCount = 0;
  }
}

// Singleton instance
let defaultSystem: BackchannelingSystem | null = null;

/**
 * Get global backchanneling system
 */
export function getBackchannelingSystem(): BackchannelingSystem {
  if (!defaultSystem) {
    defaultSystem = new BackchannelingSystem();
  }
  return defaultSystem;
}

/**
 * Reset global backchanneling system
 */
export function resetBackchannelingSystem(): void {
  if (defaultSystem) {
    defaultSystem.reset();
  }
}
