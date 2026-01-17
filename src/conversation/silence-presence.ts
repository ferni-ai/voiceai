/**
 * Silence as Presence
 *
 * Implements intentional, meaningful silences that communicate care.
 * Real human conversations have silences that MEAN something:
 *
 * - Processing silence: "Let me sit with that"
 * - Emotional silence: "This deserves space"
 * - Invitation silence: "Take your time"
 * - Presence silence: "I'm here with you"
 *
 * This is NOT about awkward pauses - it's about using silence
 * as a form of communication that shows deep attunement.
 *
 * @module @ferni/silence-presence
 */

import { humanizationSignalEmitter } from '../services/humanization/humanization-signal-emitter.js';
import { createLogger } from '../utils/safe-logger.js';
import { seededChance, seededFloat, seededIndex } from './utils/random-generator.js';

const logger = createLogger({ module: 'SilencePresence' });

// ============================================================================
// TYPES
// ============================================================================

export type SilenceReason =
  | 'processing' // Ferni is processing something complex
  | 'emotional' // Heavy emotional moment - give space
  | 'invitation' // Gentle invitation to share more
  | 'presence' // Just being here, no words needed
  | 'resonance' // Letting something land
  | 'respect'; // Honoring what was shared

export interface SilenceConfig {
  /** Minimum duration in ms */
  minDuration: number;
  /** Maximum duration in ms */
  maxDuration: number;
  /** Breath sound to play during silence (or null) */
  breathSound: 'soft_exhale' | 'settling' | 'contemplative' | null;
  /** Whether avatar should show visible presence */
  showPresence: boolean;
  /** Verbal cue before/after silence (or null for pure silence) */
  verbalCue: string | null;
}

export interface SilenceDecision {
  /** Whether to use silence here */
  useSilence: boolean;
  /** Why we're being silent */
  reason: SilenceReason;
  /** Duration in ms */
  duration: number;
  /** Configuration for this silence */
  config: SilenceConfig;
  /** SSML to inject for the silence */
  ssml: string;
}

// ============================================================================
// SILENCE CONFIGURATIONS
// ============================================================================

const SILENCE_CONFIGS: Record<SilenceReason, SilenceConfig> = {
  processing: {
    minDuration: 800,
    maxDuration: 1500,
    breathSound: 'contemplative',
    showPresence: true,
    verbalCue: null, // Pure silence
  },
  emotional: {
    minDuration: 1500,
    maxDuration: 3000,
    breathSound: 'soft_exhale',
    showPresence: true,
    verbalCue: null, // Let the silence speak
  },
  invitation: {
    minDuration: 1000,
    maxDuration: 2000,
    breathSound: null,
    showPresence: true,
    verbalCue: null,
  },
  presence: {
    minDuration: 1200,
    maxDuration: 2500,
    breathSound: 'settling',
    showPresence: true,
    verbalCue: null,
  },
  resonance: {
    minDuration: 1000,
    maxDuration: 2000,
    breathSound: 'soft_exhale',
    showPresence: true,
    verbalCue: null,
  },
  respect: {
    minDuration: 1500,
    maxDuration: 3000,
    breathSound: 'settling',
    showPresence: true,
    verbalCue: null,
  },
};

// ============================================================================
// SILENCE TRIGGERS
// ============================================================================

/**
 * Patterns that suggest emotional silence is appropriate
 */
const EMOTIONAL_PATTERNS = [
  /i('ve| have) never told anyone/i,
  /this is really hard/i,
  /i don('t| do not) know (what|how) to/i,
  /i feel so (alone|lost|scared|overwhelmed)/i,
  /i('m| am) (scared|terrified|afraid)/i,
  /i miss (them|him|her|my)/i,
  /since (they|he|she) (died|passed|left)/i,
  /i can('t|not) stop (thinking|crying|worrying)/i,
  /it('s| is) just so hard/i,
];

/**
 * Patterns that suggest processing silence
 */
const PROCESSING_PATTERNS = [
  /what do you think/i,
  /i('m| am) not sure/i,
  /let me think/i,
  /hmm/i,
  /i need to (think|process|figure)/i,
  /that('s| is) a (good|hard|tough) question/i,
];

/**
 * Patterns that suggest resonance silence (letting something land)
 */
const RESONANCE_PATTERNS = [
  /i (just )?realized/i,
  /oh (wow|my|god)/i,
  /that('s| is) (exactly|precisely) (it|right)/i,
  /i never thought of it that way/i,
  /wow/i,
  /huh/i,
];

/**
 * Vulnerability indicators that warrant respect silence
 */
const VULNERABILITY_PATTERNS = [
  /honestly/i,
  /the truth is/i,
  /i('ve| have) been struggling/i,
  /can i (tell|share|say) something/i,
  /this is embarrassing/i,
  /i('m| am) ashamed/i,
];

// ============================================================================
// SILENCE ENGINE
// ============================================================================

export class SilencePresenceEngine {
  private lastSilenceTime = 0;
  private silenceCount = 0;

  // Minimum time between silences (ms)
  private readonly MIN_SILENCE_INTERVAL = 30000; // 30 seconds

  // Max silences per conversation
  private readonly MAX_SILENCES_PER_CONV = 5;

  constructor() {
    logger.debug('SilencePresenceEngine initialized');
  }

  /**
   * Decide whether to use silence before responding
   *
   * @param userMessage - What the user just said
   * @param userEmotion - Detected emotion
   * @param turnCount - Current turn in conversation
   * @param wasPersonalSharing - Did user share something personal?
   * @param conversationDepth - How deep is the conversation?
   */
  decideSilence(context: {
    userMessage: string;
    userEmotion?: string;
    turnCount: number;
    wasPersonalSharing?: boolean;
    conversationDepth: 'surface' | 'medium' | 'deep';
    topicWeight?: 'light' | 'medium' | 'heavy';
    /** Optional seed for deterministic behavior */
    randomSeed?: string;
  }): SilenceDecision {
    const {
      userMessage,
      userEmotion,
      turnCount,
      wasPersonalSharing,
      conversationDepth,
      topicWeight,
      randomSeed,
    } = context;

    // Default: no silence
    const noSilence: SilenceDecision = {
      useSilence: false,
      reason: 'presence',
      duration: 0,
      config: SILENCE_CONFIGS.presence,
      ssml: '',
    };

    // Don't overuse silence
    if (this.silenceCount >= this.MAX_SILENCES_PER_CONV) {
      logger.debug('Max silences reached for conversation');
      return noSilence;
    }

    // Minimum interval between silences
    if (Date.now() - this.lastSilenceTime < this.MIN_SILENCE_INTERVAL) {
      return noSilence;
    }

    // Too early in conversation
    if (turnCount < 3) {
      return noSilence;
    }

    // Detect what kind of silence might be appropriate
    const reason = this.detectSilenceReason(userMessage, {
      userEmotion,
      wasPersonalSharing,
      conversationDepth,
      topicWeight,
      randomSeed,
    });

    if (!reason) {
      return noSilence;
    }

    // Get config for this type of silence
    const config = SILENCE_CONFIGS[reason];

    // Calculate duration (random within range)
    const seed =
      randomSeed ??
      `silence:${turnCount}:${conversationDepth}:${topicWeight ?? 'medium'}:${userEmotion ?? ''}:${userMessage}`;
    const roll = seededFloat(`${seed}:duration`);
    const duration = config.minDuration + roll * (config.maxDuration - config.minDuration);

    // Build SSML
    const ssml = this.buildSilenceSsml(reason, duration, config);

    // Record this silence
    this.lastSilenceTime = Date.now();
    this.silenceCount++;

    // 🌉 Emit signal to frontend for avatar presence
    void humanizationSignalEmitter.silenceMoment(duration, reason);

    logger.debug({ reason, duration, turnCount }, 'Silence decision: using silence');

    return {
      useSilence: true,
      reason,
      duration: Math.round(duration),
      config,
      ssml,
    };
  }

  /**
   * Detect what type of silence might be appropriate
   */
  private detectSilenceReason(
    userMessage: string,
    context: {
      userEmotion?: string;
      wasPersonalSharing?: boolean;
      conversationDepth: 'surface' | 'medium' | 'deep';
      topicWeight?: 'light' | 'medium' | 'heavy';
      randomSeed?: string;
    }
  ): SilenceReason | null {
    const { userEmotion, wasPersonalSharing, conversationDepth, topicWeight, randomSeed } = context;
    const seedBase =
      randomSeed ??
      `silence-reason:${conversationDepth}:${topicWeight ?? 'medium'}:${userEmotion ?? ''}:${userMessage}`;

    // Check emotional patterns first (highest priority)
    if (EMOTIONAL_PATTERNS.some((p) => p.test(userMessage))) {
      // High probability for emotional silence
      if (seededChance(`${seedBase}:emotional`, 0.7)) {
        return 'emotional';
      }
    }

    // Vulnerability deserves respect
    if (VULNERABILITY_PATTERNS.some((p) => p.test(userMessage))) {
      if (seededChance(`${seedBase}:respect`, 0.6)) {
        return 'respect';
      }
    }

    // Resonance after insights
    if (RESONANCE_PATTERNS.some((p) => p.test(userMessage))) {
      if (seededChance(`${seedBase}:resonance`, 0.5)) {
        return 'resonance';
      }
    }

    // Processing after questions/uncertainty
    if (PROCESSING_PATTERNS.some((p) => p.test(userMessage))) {
      if (seededChance(`${seedBase}:processing`, 0.4)) {
        return 'processing';
      }
    }

    // Context-based decisions
    if (wasPersonalSharing && topicWeight === 'heavy') {
      if (seededChance(`${seedBase}:personal-heavy`, 0.5)) {
        return 'emotional';
      }
    }

    if (conversationDepth === 'deep' && userEmotion) {
      const emotionalEmotions = ['sad', 'anxious', 'vulnerable', 'overwhelmed', 'grief'];
      if (emotionalEmotions.includes(userEmotion.toLowerCase())) {
        if (seededChance(`${seedBase}:deep-emotion`, 0.5)) {
          return 'presence';
        }
      }
    }

    // Occasionally use presence silence in deep conversations
    if (conversationDepth === 'deep' && seededChance(`${seedBase}:deep-presence`, 0.1)) {
      return 'presence';
    }

    return null;
  }

  /**
   * Build SSML for the silence
   */
  private buildSilenceSsml(reason: SilenceReason, duration: number, config: SilenceConfig): string {
    const parts: string[] = [];

    // Add verbal cue if configured
    if (config.verbalCue) {
      parts.push(config.verbalCue);
    }

    // Add breath sound marker (processed by TTS)
    if (config.breathSound) {
      parts.push(`<mark name="breath:${config.breathSound}"/>`);
    }

    // Add the silence itself
    parts.push(`<break time="${Math.round(duration)}ms"/>`);

    // Add presence marker for avatar
    if (config.showPresence) {
      parts.push(`<mark name="presence:${reason}"/>`);
    }

    return parts.join('');
  }

  /**
   * Get a verbal cue to use before intentional silence
   * Only used when we want to signal the silence explicitly
   */
  getVerbalCueForSilence(reason: SilenceReason): string | null {
    const cues: Record<SilenceReason, string[]> = {
      processing: ['Let me sit with that for a moment...', 'Hmm...', 'Give me a second...'],
      emotional: [
        // Usually no verbal cue - just be present
      ],
      invitation: ['Take your time...', "I'm here...", 'No rush...'],
      presence: [
        // Just be
      ],
      resonance: [
        // Let it land
      ],
      respect: ["That's a lot to share...", 'I hear you...'],
    };

    const options = cues[reason];
    if (!options || options.length === 0) {
      return null;
    }

    const index = seededIndex(`silence-cue:${reason}`, options.length);
    return options[index] ?? null;
  }

  /**
   * Apply silence to a response if appropriate
   * Modifies the response to include silence at the beginning
   */
  applyToResponse(response: string, decision: SilenceDecision): { text: string; ssml: string } {
    if (!decision.useSilence) {
      return { text: response, ssml: response };
    }

    // Get optional verbal cue
    const verbalCue = this.getVerbalCueForSilence(decision.reason);

    // Build the modified response
    let { ssml } = decision;
    let text = '';

    if (verbalCue) {
      text = `${verbalCue} `;
    }

    text += response;
    ssml += response;

    return { text, ssml };
  }

  /**
   * Reset for new conversation
   */
  reset(): void {
    this.lastSilenceTime = 0;
    this.silenceCount = 0;
    logger.debug('SilencePresenceEngine reset');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: SilencePresenceEngine | null = null;

export function getSilencePresenceEngine(): SilencePresenceEngine {
  if (!instance) {
    instance = new SilencePresenceEngine();
  }
  return instance;
}

export function resetSilencePresenceEngine(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}

export default SilencePresenceEngine;
