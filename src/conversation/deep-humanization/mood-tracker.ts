/**
 * Mood Tracker
 *
 * Tracks the agent's mood throughout a conversation.
 * Mood influences which humanization effects are appropriate.
 *
 * @module @ferni/conversation/deep-humanization/mood-tracker
 */

import { createLogger } from '../../utils/safe-logger.js';
import { humanizationSignalEmitter } from '../../services/humanization/humanization-signal-emitter.js';
import type { ConversationMood } from './types.js';

const log = createLogger({ module: 'MoodTracker' });

// ============================================================================
// MOOD TRACKER
// ============================================================================

export class MoodTracker {
  private mood: ConversationMood;
  private turnCount = 0;

  constructor() {
    this.mood = this.getInitialMood();
  }

  private getInitialMood(): ConversationMood {
    return {
      energy: 0.75,
      engagement: 0.7,
      emotionalLoad: 0,
      heavyTopicCount: 0,
      inEmotionalMoment: false,
    };
  }

  /**
   * Update mood based on conversation dynamics
   */
  update(context: {
    userEmotion?: string;
    topicWeight?: 'light' | 'medium' | 'heavy';
    userEngagement?: 'low' | 'medium' | 'high';
    turnCount: number;
  }): void {
    this.turnCount = context.turnCount;

    // Energy drifts down over time, especially with heavy topics
    if (context.topicWeight === 'heavy') {
      this.mood.energy = Math.max(0.4, this.mood.energy - 0.08);
      this.mood.emotionalLoad += 0.15;
      this.mood.heavyTopicCount++;
    } else if (context.topicWeight === 'light') {
      this.mood.energy = Math.min(0.95, this.mood.energy + 0.03);
      this.mood.emotionalLoad = Math.max(0, this.mood.emotionalLoad - 0.05);
    }

    // Natural energy decay over long sessions
    if (context.turnCount > 15) {
      this.mood.energy = Math.max(0.45, this.mood.energy - 0.02);
    }

    // Engagement responds to user engagement
    if (context.userEngagement === 'high') {
      this.mood.engagement = Math.min(0.95, this.mood.engagement + 0.1);
    } else if (context.userEngagement === 'low') {
      this.mood.engagement = Math.max(0.4, this.mood.engagement - 0.05);
    }

    // Track emotional moments
    this.mood.inEmotionalMoment =
      context.userEmotion === 'sadness' ||
      context.userEmotion === 'fear' ||
      context.userEmotion === 'vulnerable';

    log.debug({ mood: this.mood, turn: context.turnCount }, 'Mood updated');

    // Emit mood drift signal to frontend every few turns or on significant changes
    if (context.turnCount % 5 === 0 || this.mood.inEmotionalMoment) {
      void humanizationSignalEmitter.moodDrift({
        energy: this.mood.energy,
        engagement: this.mood.engagement,
        emotionalLoad: this.mood.emotionalLoad,
      });
    }

    // Emit vulnerability signal if in emotional moment
    if (this.mood.inEmotionalMoment && context.userEmotion === 'vulnerable') {
      void humanizationSignalEmitter.vulnerability(0.8);
    }
  }

  /**
   * Get current mood state
   */
  getMood(): ConversationMood {
    return { ...this.mood };
  }

  /**
   * Check if mood suggests we should be playful
   */
  canBePlayful(): boolean {
    return this.mood.emotionalLoad < 0.4 && this.mood.energy > 0.5;
  }

  /**
   * Check if mood suggests we should be supportive
   */
  needsSupport(): boolean {
    return this.mood.inEmotionalMoment || this.mood.emotionalLoad > 0.5;
  }

  /**
   * Check if energy is high enough for enthusiastic reactions
   */
  hasHighEnergy(): boolean {
    return this.mood.energy > 0.7 && this.mood.engagement > 0.7;
  }

  /**
   * Check if we're in late session (energy naturally lower)
   */
  isLateSession(): boolean {
    return this.turnCount > 15 && this.mood.energy < 0.55;
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.mood = this.getInitialMood();
    this.turnCount = 0;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

const trackers = new Map<string, MoodTracker>();

export function getMoodTracker(personaId: string): MoodTracker {
  let tracker = trackers.get(personaId);
  if (!tracker) {
    tracker = new MoodTracker();
    trackers.set(personaId, tracker);
  }
  return tracker;
}

export function resetMoodTracker(personaId: string): void {
  const tracker = trackers.get(personaId);
  if (tracker) {
    tracker.reset();
  }
  trackers.delete(personaId);
}

export function resetAllMoodTrackers(): void {
  trackers.clear();
}
