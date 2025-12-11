/**
 * Backchanneling System - GAP 1.4
 *
 * Provides verbal "nods" and listening cues during user speech.
 * Makes agents feel present and engaged, not silent.
 *
 * NOW USES PERSONA-SPECIFIC BACKCHANNELS for distinct personalities!
 */

import type { EmotionResult } from '../intelligence/emotion-detector.js';
import { getEnhancedBackchannel } from '../personas/theatrical.js';
import { getLogger } from '../utils/safe-logger.js';
import type { TopicWeight } from './speech-context.js';

// ============================================================================
// TYPES
// ============================================================================

export interface BackchannelContext {
  userHasBeenSpeaking: number; // milliseconds
  userPausedBriefly: boolean;
  userEmotion: EmotionResult;
  topicWeight: TopicWeight;
  lastBackchannelTime?: number;
  personaId?: string; // NEW: For persona-specific backchannels
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
  private lastBackchannelTime = 0;
  private backchannelCount = 0;
  private readonly MIN_INTERVAL_MS = 5000; // Don't backchannel more than every 5 seconds

  /**
   * Determine if agent should backchannel (verbal nod)
   */
  shouldBackchannel(context: BackchannelContext): BackchannelResult {
    const {
      userHasBeenSpeaking,
      userPausedBriefly,
      userEmotion,
      topicWeight,
      lastBackchannelTime,
      personaId,
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
        phrase: this.getBackchannel(userEmotion, topicWeight, personaId),
        timing: 'after_pause',
      };
    }

    // Heavy emotional content? Show you're present
    if (topicWeight === 'heavy' && userHasBeenSpeaking > 5000 && userPausedBriefly) {
      getLogger().debug('Backchanneling: heavy topic, user needs support');
      return {
        shouldBackchannel: true,
        phrase: this.getBackchannel(userEmotion, topicWeight, personaId),
        timing: 'after_pause',
      };
    }

    // User seems distressed? Provide support cue
    if (userEmotion.distressLevel > 0.6 && userHasBeenSpeaking > 6000) {
      getLogger().debug('Backchanneling: user distressed');
      return {
        shouldBackchannel: true,
        phrase: this.getBackchannel(userEmotion, topicWeight, personaId),
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
   * Get appropriate backchannel phrase based on emotion, topic, and PERSONA
   * Now uses persona-specific backchannels for distinct personalities!
   */
  getBackchannel(emotion: EmotionResult, topicWeight: TopicWeight, personaId?: string): string {
    // Determine emotion type for persona-specific backchannel
    let emotionType: 'neutral' | 'engaged' | 'empathetic' | 'excited' | 'supportive';

    if (topicWeight === 'heavy' || emotion.distressLevel > 0.5) {
      emotionType = 'empathetic';
    } else if (emotion.distressLevel > 0.3) {
      emotionType = 'supportive';
    } else if (emotion.confidence > 0.7 && emotion.primary === 'joy') {
      emotionType = 'excited';
    } else if (emotion.intensity > 0.6) {
      emotionType = 'engaged';
    } else {
      emotionType = 'neutral';
    }

    // Try persona-specific backchannel first
    if (personaId) {
      try {
        const personaBackchannel = getEnhancedBackchannel(personaId, emotionType);
        if (personaBackchannel) {
          // Wrap in volume control for naturalness
          return `<volume ratio="0.8">${personaBackchannel}</volume>`;
        }
      } catch {
        // Fall through to defaults
      }
    }

    // Fallback to generic backchannels
    if (emotionType === 'empathetic') {
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

// ============================================================================
// SESSION-SCOPED BACKCHANNELING
// ============================================================================

/**
 * FIX BUG #voice-10: Session-scoped backchanneling systems
 */
const sessionBackchannelingSystems = new Map<string, BackchannelingSystem>();

/**
 * Get or create a backchanneling system for a specific session
 */
export function getSessionBackchannelingSystem(sessionId: string): BackchannelingSystem {
  let system = sessionBackchannelingSystems.get(sessionId);
  if (!system) {
    system = new BackchannelingSystem();
    sessionBackchannelingSystems.set(sessionId, system);
  }
  return system;
}

/**
 * Remove a session's backchanneling system (on session end)
 */
export function removeSessionBackchannelingSystem(sessionId: string): void {
  sessionBackchannelingSystems.delete(sessionId);
}

/**
 * Alias for removeSessionBackchannelingSystem (preferred naming)
 */
export const resetSessionBackchannelingSystem = removeSessionBackchannelingSystem;

// ============================================================================
// LEGACY COMPATIBILITY (Remove after all callers migrated)
// ============================================================================

/**
 * Get or create a global backchanneling system.
 *
 * @deprecated Use getSessionBackchannelingSystem(sessionId) for proper session isolation.
 * This function creates a system with a synthetic session ID.
 */
export function getBackchannelingSystem(): BackchannelingSystem {
  return getSessionBackchannelingSystem('__global__');
}
