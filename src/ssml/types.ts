/**
 * SSML Types - Single Source of Truth
 *
 * Type definitions for the SSML module.
 * This is the CANONICAL source for all SSML-related types.
 *
 * Other modules should import types from here:
 * ```typescript
 * import type { PronunciationEntry, CartesiaEmotion } from '../ssml/types.js';
 * ```
 *
 * @module ssml/types
 */

// =============================================================================
// RE-EXPORT TYPES FROM SOURCE MODULES
// =============================================================================

// Re-export types from their canonical sources to avoid duplication
export type { ThinkingContext, ThinkingInjection } from '../conversation/thinking-time-injector.js';

export type { BreathGroupConfig, FillerConfig } from '../speech/advanced-humanization.js';

// =============================================================================
// PRONUNCIATION TYPES
// =============================================================================

/**
 * Entry for pronunciation dictionary
 */
export interface PronunciationEntry {
  /** Regex pattern to match */
  pattern: RegExp;
  /** Replacement text (phonetic representation) */
  replacement: string;
  /** Optional description for documentation */
  description?: string;
}

// =============================================================================
// TAGGING CONTEXT TYPES
// =============================================================================

/**
 * Context information used during SSML tagging
 */
export interface TaggingContext {
  /** Detected emotion */
  emotion: string;
  /** Base speech speed ratio */
  baseSpeed: number;
  /** Base volume ratio */
  baseVolume: number;
  /** Whether emphasis was detected */
  hasEmphasis: boolean;
  /** Whether whisper was detected */
  hasWhisper: boolean;
  /** Whether laughter was detected */
  hasLaughter: boolean;
  /** Whether a sigh was detected */
  hasSigh: boolean;
  /** Whether disfluency was detected */
  hasDisfluency?: boolean;
  /** Whether repetition was detected */
  hasRepetition?: boolean;
  /** Whether sarcasm was detected */
  hasSarcasm?: boolean;
  /** Number of sentences in text */
  sentenceCount?: number;
  /** Average sentence length */
  avgSentenceLength?: number;
}

// =============================================================================
// DETECTION RESULT TYPES
// =============================================================================

/**
 * Result of pacing detection
 */
export interface DetectedPacing {
  /** Speed ratio (0.6-1.5) */
  speed: number;
  /** Reason for the detected speed */
  reason: string;
}

/**
 * Result of volume detection
 */
export interface DetectedVolume {
  /** Volume ratio (0.5-2.0) */
  volume: number;
  /** Whether emphasis was detected */
  hasEmphasis: boolean;
  /** Whether whisper was detected */
  hasWhisper: boolean;
}

/**
 * Result of vocal cue detection
 */
export interface DetectedVocalCues {
  /** Whether laughter was detected */
  hasLaughter: boolean;
  /** Whether a sigh was detected */
  hasSigh: boolean;
  /** Whether disfluency was detected */
  hasDisfluency: boolean;
  /** Whether repetition was detected */
  hasRepetition: boolean;
  /** Whether sarcasm was detected */
  hasSarcasm: boolean;
  /** Count of laughter occurrences */
  laughterCount?: number;
}

// =============================================================================
// CARTESIA EMOTION TYPES
// Full list of Cartesia Sonic-3 supported emotions
// @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags
// =============================================================================

/**
 * All 60+ emotions supported by Cartesia Sonic-3 TTS
 * Use these values in <emotion value="..."/> tags
 *
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/volume-speed-emotion
 *
 * Primary emotions (best results): neutral, angry, excited, content, sad, scared
 */
export const CARTESIA_EMOTIONS = {
  // ==========================================================================
  // PRIMARY EMOTIONS (Most reliable, best training data)
  // ==========================================================================
  NEUTRAL: 'neutral',
  ANGRY: 'angry',
  EXCITED: 'excited',
  CONTENT: 'content',
  SAD: 'sad',
  SCARED: 'scared',

  // ==========================================================================
  // POSITIVE EMOTIONS - Joy & Enthusiasm
  // ==========================================================================
  HAPPY: 'happy',
  ENTHUSIASTIC: 'enthusiastic',
  ELATED: 'elated',
  EUPHORIC: 'euphoric',
  TRIUMPHANT: 'triumphant',
  AMAZED: 'amazed',
  SURPRISED: 'surprised',
  FLIRTATIOUS: 'flirtatious',
  JOKING: 'joking', // Also: 'comedic'
  CURIOUS: 'curious',
  PEACEFUL: 'peaceful',
  SERENE: 'serene',
  CALM: 'calm',
  GRATEFUL: 'grateful',
  AFFECTIONATE: 'affectionate',
  TRUST: 'trust',
  SYMPATHETIC: 'sympathetic',
  ANTICIPATION: 'anticipation',
  MYSTERIOUS: 'mysterious',

  // ==========================================================================
  // NEGATIVE EMOTIONS - Anger Spectrum
  // ==========================================================================
  MAD: 'mad',
  OUTRAGED: 'outraged',
  FRUSTRATED: 'frustrated',
  AGITATED: 'agitated',
  THREATENED: 'threatened',
  DISGUSTED: 'disgusted',
  CONTEMPT: 'contempt',
  ENVIOUS: 'envious',
  SARCASTIC: 'sarcastic',
  IRONIC: 'ironic',

  // ==========================================================================
  // NEGATIVE EMOTIONS - Sadness Spectrum
  // ==========================================================================
  DEJECTED: 'dejected',
  MELANCHOLIC: 'melancholic',
  DISAPPOINTED: 'disappointed',
  HURT: 'hurt',
  GUILTY: 'guilty',
  BORED: 'bored',
  TIRED: 'tired',
  REJECTED: 'rejected',
  NOSTALGIC: 'nostalgic',
  WISTFUL: 'wistful',
  APOLOGETIC: 'apologetic',
  HESITANT: 'hesitant',
  INSECURE: 'insecure',
  CONFUSED: 'confused',
  RESIGNED: 'resigned',

  // ==========================================================================
  // FEAR & ANXIETY SPECTRUM
  // ==========================================================================
  ANXIOUS: 'anxious',
  PANICKED: 'panicked',
  ALARMED: 'alarmed',

  // ==========================================================================
  // CONFIDENT & ASSERTIVE
  // ==========================================================================
  PROUD: 'proud',
  CONFIDENT: 'confident',
  DISTANT: 'distant',
  SKEPTICAL: 'skeptical',
  CONTEMPLATIVE: 'contemplative',
  DETERMINED: 'determined',

  // ==========================================================================
  // LEGACY ALIASES (for backwards compatibility)
  // ==========================================================================
  WARM: 'affectionate', // Alias → affectionate
  CARING: 'sympathetic', // Alias → sympathetic
  THOUGHTFUL: 'contemplative', // Alias → contemplative
} as const;

/**
 * Union type of all valid Cartesia emotion values
 */
export type CartesiaEmotion = (typeof CARTESIA_EMOTIONS)[keyof typeof CARTESIA_EMOTIONS];

/**
 * Array of all Cartesia emotion values for validation
 */
export const ALL_CARTESIA_EMOTIONS: CartesiaEmotion[] = Object.values(CARTESIA_EMOTIONS);

/**
 * Emotions that are directly supported by Cartesia's emotion tag
 * (subset that definitely work in <emotion value="..."/>)
 *
 * Primary emotions with best results: neutral, angry, excited, content, sad, scared
 */
export const CARTESIA_SUPPORTED_EMOTIONS: CartesiaEmotion[] = [
  CARTESIA_EMOTIONS.ANGRY,
  CARTESIA_EMOTIONS.SAD,
  CARTESIA_EMOTIONS.SURPRISED,
  CARTESIA_EMOTIONS.CURIOUS,
  CARTESIA_EMOTIONS.AFFECTIONATE,
];

/**
 * Best Cartesia voices for emotional expression
 * These voices have the best emotional response according to Cartesia docs
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/volume-speed-emotion
 */
export const CARTESIA_EMOTIVE_VOICES = {
  LEO: '0834f3df-e650-4766-a20c-5a93a43aa6e3',
  JACE: '6776173b-fd72-460d-89b3-d85812ee518d',
  KYLE: 'c961b81c-a935-4c17-bfb3-ba2239de8c2f',
  GAVIN: 'f4a3a8e4-694c-4c45-9ca0-27caf97901b5',
  MAYA: 'cbaf8084-f009-4838-a096-07ee2e6612b1',
  TESSA: '6ccbfb76-1fc6-48f7-b71d-91ac6298247b',
  DANA: 'cc00e582-ed66-4004-8336-0175b85c85f6',
  MARIAN: '26403c37-80c1-4a1a-8692-540551ca2ae5',
} as const;

/**
 * Check if an emotion value is directly supported in Cartesia's emotion tag
 */
export function isCartesiaSupportedEmotion(emotion: string): boolean {
  return CARTESIA_SUPPORTED_EMOTIONS.includes(emotion as CartesiaEmotion);
}

// =============================================================================
// SSML TAG OPTION TYPES
// =============================================================================

// Import the actual types from source modules
import type { BreathGroupConfig, FillerConfig } from '../speech/advanced-humanization.js';
import type { ThinkingContext, ThinkingInjection } from '../conversation/thinking-time-injector.js';

/**
 * Options for SSML tagging functions
 */
export interface SsmlTagOptions {
  /** Persona ID for persona-specific adjustments */
  personaId?: string;
  /** Base speech speed (0.6-1.5) */
  baseSpeed?: number;
  /** Base volume (0.5-2.0) */
  baseVolume?: number;
  /** Whether to apply humanization */
  humanize?: boolean;

  // Advanced humanization options
  /** Enable natural filler injection ("um", "well", etc.) - default: true */
  naturalFillers?: boolean;
  /** Enable breath group pacing (pauses at phrase boundaries) - default: true */
  breathGroupPacing?: boolean;
  /** Filler injection configuration */
  fillerConfig?: FillerConfig;
  /** Breath group configuration */
  breathConfig?: BreathGroupConfig;

  // Thinking time options
  /** Enable thinking time injection - default: false */
  thinkingTime?: boolean;
  /** Context for thinking time calculation */
  thinkingContext?: ThinkingContext;
  /** Pre-calculated thinking injection */
  thinkingInjection?: ThinkingInjection;
}

// =============================================================================
// SANITIZATION TYPES
// =============================================================================

/**
 * Result of SSML sanitization
 */
export interface SanitizationResult {
  /** Sanitized text */
  text: string;
  /** Whether any issues were found */
  hasIssues: boolean;
  /** List of issues found */
  issues: string[];
}

/**
 * TTS check result
 */
export interface TTSCheckResult {
  /** Whether any issues were found */
  hasIssues: boolean;
  /** List of suspicious patterns found */
  suspiciousPatterns: string[];
  /** List of potential stage directions */
  potentialStageDirections: string[];
}
