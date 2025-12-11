/**
 * Enhanced Backchanneling System
 *
 * Research-backed active listening sounds that signal presence and engagement.
 *
 * Key improvements over basic backchanneling:
 * 1. **Faster response** - Triggers at shorter pauses (3-5s vs 8s)
 * 2. **Context-aware** - Different sounds for different emotional states
 * 3. **Varied repertoire** - More natural variety in responses
 * 4. **Persona-specific** - Each persona has distinct listening style
 *
 * Research shows backchanneling:
 * - Reduces awkward pauses
 * - Encourages users to continue speaking
 * - Increases perceived attentiveness and trust
 *
 * NOTE: This module is kept for backward compatibility.
 * New code should use the unified backchanneling module at ./backchanneling/
 *
 * @see docs/VOICE-HUMANIZATION-RESEARCH.md
 * @see ./backchanneling/index.ts for unified API
 */

import type { EmotionResult } from '../intelligence/emotion-detector.js';
import { createLogger } from '../utils/safe-logger.js';

// Import from persona-phrases (single source of truth)
import {
  BACKCHANNEL_LIBRARY as _BACKCHANNEL_LIBRARY,
  PERSONA_BACKCHANNEL_STYLE as _PERSONA_BACKCHANNEL_STYLE,
  type BackchannelCategory,
} from './persona-phrases.js';

const log = createLogger({ module: 'EnhancedBackchanneling' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * @deprecated Use BackchannelCategory from persona-phrases.ts
 */
export type BackchannelType = BackchannelCategory;

export interface BackchannelTiming {
  /** Minimum user speech duration before backchannel (ms) */
  minSpeechDuration: number;

  /** Pause duration that triggers backchannel (ms) */
  pauseTriggerDuration: number;

  /** Minimum time between backchannels (ms) */
  cooldownPeriod: number;

  /** Maximum backchannels per conversation turn */
  maxPerTurn: number;
}

export interface EnhancedBackchannelContext {
  /** How long user has been speaking (ms) */
  userSpeechDuration: number;

  /** Current pause duration (ms) */
  currentPauseDuration: number;

  /** User's detected emotion */
  userEmotion: EmotionResult;

  /** Conversation topic weight */
  topicWeight: 'light' | 'medium' | 'heavy';

  /** Persona ID for style */
  personaId?: string;

  /** User's recent content (for context-aware responses) */
  recentContent?: string;

  /** Number of backchannels already given this turn */
  backchannelCountThisTurn: number;

  /** Time of last backchannel (ms timestamp) */
  lastBackchannelTime?: number;
}

export interface BackchannelDecision {
  /** Whether to emit a backchannel */
  shouldEmit: boolean;

  /** The backchannel phrase to use */
  phrase: string | null;

  /** Type of backchannel */
  type: BackchannelType | null;

  /** SSML-formatted output */
  ssml: string | null;

  /** Reason for decision */
  reason: string;
}

// ============================================================================
// BACKCHANNEL LIBRARIES (Re-exported from persona-phrases)
// ============================================================================

/**
 * Core backchannel library with variations
 * @see persona-phrases.ts for source of truth
 */
export const BACKCHANNEL_LIBRARY = _BACKCHANNEL_LIBRARY;

/**
 * Persona-specific backchannel preferences
 * @see persona-phrases.ts for source of truth
 */
export const PERSONA_BACKCHANNEL_STYLE = _PERSONA_BACKCHANNEL_STYLE;

// ============================================================================
// TIMING CONFIGURATIONS
// ============================================================================

/**
 * Default timing - more responsive than basic backchanneling
 */
const DEFAULT_TIMING: BackchannelTiming = {
  minSpeechDuration: 3000, // 3 seconds of speaking (vs 8s before)
  pauseTriggerDuration: 800, // 800ms pause triggers (vs 5s before)
  cooldownPeriod: 4000, // 4 seconds between backchannels (vs 5s)
  maxPerTurn: 3, // Max 3 per user turn
};

/**
 * Timing for heavy/emotional topics - more space
 */
const HEAVY_TOPIC_TIMING: BackchannelTiming = {
  minSpeechDuration: 4000,
  pauseTriggerDuration: 1200, // Longer pause for emotional content
  cooldownPeriod: 5000,
  maxPerTurn: 2,
};

/**
 * Timing for light topics - more responsive
 */
const LIGHT_TOPIC_TIMING: BackchannelTiming = {
  minSpeechDuration: 2500,
  pauseTriggerDuration: 600,
  cooldownPeriod: 3500,
  maxPerTurn: 4,
};

// ============================================================================
// BACKCHANNEL DECISION ENGINE
// ============================================================================

/**
 * Enhanced backchannel decision engine
 *
 * Makes intelligent decisions about when and what to backchannel
 * based on context, timing, and user state.
 */
export class EnhancedBackchannelingEngine {
  private lastBackchannelTime = 0;
  private backchannelHistory: Array<{ type: BackchannelType; time: number }> = [];
  private turnBackchannelCount = 0;
  private readonly maxHistorySize = 20;

  constructor() {
    log.debug('EnhancedBackchannelingEngine initialized');
  }

  /**
   * Decide whether to emit a backchannel
   */
  decide(context: EnhancedBackchannelContext): BackchannelDecision {
    // Get appropriate timing config
    const timing = this.getTimingConfig(context.topicWeight);

    // Check if we should backchannel based on timing
    const timingCheck = this.checkTiming(context, timing);
    if (!timingCheck.shouldProceed) {
      return {
        shouldEmit: false,
        phrase: null,
        type: null,
        ssml: null,
        reason: timingCheck.reason,
      };
    }

    // Determine best backchannel type for context
    const type = this.selectBackchannelType(context);

    // Get phrase (avoiding recent repetition)
    const phrase = this.selectPhrase(type, context.personaId);

    // Build SSML
    const ssml = this.buildSsml(phrase, context.personaId);

    // Record this backchannel
    this.recordBackchannel(type);

    log.debug(
      {
        type,
        phrase,
        speechDuration: context.userSpeechDuration,
        pauseDuration: context.currentPauseDuration,
      },
      '🎧 Backchannel emitted'
    );

    return {
      shouldEmit: true,
      phrase,
      type,
      ssml,
      reason: 'User paused after sufficient speech - active listening',
    };
  }

  /**
   * Get timing config based on topic weight
   */
  private getTimingConfig(topicWeight: 'light' | 'medium' | 'heavy'): BackchannelTiming {
    switch (topicWeight) {
      case 'heavy':
        return HEAVY_TOPIC_TIMING;
      case 'light':
        return LIGHT_TOPIC_TIMING;
      default:
        return DEFAULT_TIMING;
    }
  }

  /**
   * Check if timing conditions are met
   */
  private checkTiming(
    context: EnhancedBackchannelContext,
    timing: BackchannelTiming
  ): { shouldProceed: boolean; reason: string } {
    // Check max per turn
    if (context.backchannelCountThisTurn >= timing.maxPerTurn) {
      return { shouldProceed: false, reason: 'Max backchannels per turn reached' };
    }

    // Check cooldown
    if (context.lastBackchannelTime) {
      const timeSinceLast = Date.now() - context.lastBackchannelTime;
      if (timeSinceLast < timing.cooldownPeriod) {
        return { shouldProceed: false, reason: 'Cooldown period not elapsed' };
      }
    }

    // Check minimum speech duration
    if (context.userSpeechDuration < timing.minSpeechDuration) {
      return { shouldProceed: false, reason: "User hasn't spoken long enough" };
    }

    // Check pause duration
    if (context.currentPauseDuration < timing.pauseTriggerDuration) {
      return { shouldProceed: false, reason: 'Pause not long enough' };
    }

    return { shouldProceed: true, reason: 'Timing conditions met' };
  }

  /**
   * Select appropriate backchannel type based on context
   */
  private selectBackchannelType(context: EnhancedBackchannelContext): BackchannelType {
    const { userEmotion, topicWeight, recentContent } = context;

    // Heavy emotional content → empathy
    if (topicWeight === 'heavy' || userEmotion.distressLevel > 0.5) {
      return 'empathy';
    }

    // User seems upset/angry → empathy + encouragement
    if (userEmotion.primary === 'anger') {
      return Math.random() < 0.6 ? 'empathy' : 'encouragement';
    }

    // User is sharing something positive/exciting → surprise or agreement
    if (userEmotion.primary === 'joy' || userEmotion.intensity > 0.7) {
      return Math.random() < 0.5 ? 'surprise' : 'agreement';
    }

    // Content contains questions or seeking → thinking
    if (recentContent && /\?|what do you think|should I/i.test(recentContent)) {
      return 'thinking';
    }

    // Long explanation → understanding
    if (context.userSpeechDuration > 8000) {
      return 'understanding';
    }

    // Default: mix of acknowledgment and encouragement
    const defaults: BackchannelType[] = ['acknowledgment', 'encouragement', 'understanding'];
    return defaults[Math.floor(Math.random() * defaults.length)];
  }

  /**
   * Select phrase, avoiding recent repetition
   */
  private selectPhrase(type: BackchannelType, personaId?: string): string {
    const options = [...BACKCHANNEL_LIBRARY[type]];

    // Get persona preferences
    const personaStyle = personaId ? PERSONA_BACKCHANNEL_STYLE[personaId] : null;

    // Filter out recently used phrases
    const recentPhrases = this.backchannelHistory.slice(-5).map((h) => {
      const typeOptions = BACKCHANNEL_LIBRARY[h.type];
      return typeOptions[Math.floor(Math.random() * typeOptions.length)];
    });

    const available = options.filter((p) => !recentPhrases.includes(p));
    const pool = available.length > 0 ? available : options;

    // Persona might prefer certain phrases
    if (personaStyle?.preferred.includes(type)) {
      // Boost this type's phrases
      return pool[0]; // Use first (most natural) option
    }

    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Build SSML-formatted backchannel
   */
  private buildSsml(phrase: string, personaId?: string): string {
    const personaStyle = personaId ? PERSONA_BACKCHANNEL_STYLE[personaId] : null;
    const volumeRatio = personaStyle?.volumeRatio ?? 0.75;
    const emotionTag = personaStyle?.emotionTag;

    let ssml = `<volume ratio="${volumeRatio}"/>`;

    if (emotionTag) {
      ssml += `<emotion value="${emotionTag}"/>`;
    }

    ssml += phrase;

    // Add trailing break for natural pause after backchannel
    ssml += '<break time="200ms"/>';

    return ssml;
  }

  /**
   * Record backchannel for history
   */
  private recordBackchannel(type: BackchannelType): void {
    const now = Date.now();
    this.lastBackchannelTime = now;
    this.turnBackchannelCount++;

    this.backchannelHistory.push({ type, time: now });

    // Trim history
    if (this.backchannelHistory.length > this.maxHistorySize) {
      this.backchannelHistory.shift();
    }
  }

  /**
   * Reset for new turn
   */
  newTurn(): void {
    this.turnBackchannelCount = 0;
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.lastBackchannelTime = 0;
    this.backchannelHistory = [];
    this.turnBackchannelCount = 0;
    log.debug('EnhancedBackchannelingEngine reset');
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalBackchannels: number;
    lastBackchannelTime: number;
    recentTypes: BackchannelType[];
  } {
    return {
      totalBackchannels: this.backchannelHistory.length,
      lastBackchannelTime: this.lastBackchannelTime,
      recentTypes: this.backchannelHistory.slice(-5).map((h) => h.type),
    };
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

const sessionEngines = new Map<string, EnhancedBackchannelingEngine>();

/**
 * Get or create enhanced backchanneling engine for session
 */
export function getEnhancedBackchannelingEngine(sessionId: string): EnhancedBackchannelingEngine {
  let engine = sessionEngines.get(sessionId);
  if (!engine) {
    engine = new EnhancedBackchannelingEngine();
    sessionEngines.set(sessionId, engine);
  }
  return engine;
}

/**
 * Remove session's backchanneling engine
 */
export function removeEnhancedBackchannelingEngine(sessionId: string): void {
  sessionEngines.delete(sessionId);
}

/**
 * Alias for removeEnhancedBackchannelingEngine (preferred naming)
 */
export const resetEnhancedBackchannelingEngine = removeEnhancedBackchannelingEngine;

// ============================================================================
// QUICK BACKCHANNELS
// For use in the real-time pipeline
// ============================================================================

/**
 * Get a quick backchannel phrase based on emotion only
 * For use when full context isn't available
 */
export function getQuickBackchannel(userDistressLevel: number, personaId?: string): string {
  let type: BackchannelType;

  if (userDistressLevel > 0.5) {
    type = 'empathy';
  } else if (userDistressLevel > 0.2) {
    type = 'acknowledgment';
  } else {
    type = Math.random() < 0.5 ? 'acknowledgment' : 'encouragement';
  }

  const options = BACKCHANNEL_LIBRARY[type];
  const phrase = options[Math.floor(Math.random() * options.length)];

  const personaStyle = personaId ? PERSONA_BACKCHANNEL_STYLE[personaId] : null;
  const volumeRatio = personaStyle?.volumeRatio ?? 0.75;

  return `<volume ratio="${volumeRatio}"/>${phrase}`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  EnhancedBackchannelingEngine,
  getEnhancedBackchannelingEngine,
  removeEnhancedBackchannelingEngine,
  getQuickBackchannel,
  BACKCHANNEL_LIBRARY,
  PERSONA_BACKCHANNEL_STYLE,
};
