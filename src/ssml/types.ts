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
 * All emotions supported by Cartesia Sonic-3 TTS
 * Use these values in <emotion value="..."/> tags
 */
export const CARTESIA_EMOTIONS = {
  // Primary emotions
  NEUTRAL: 'neutral',
  ANGRY: 'angry',
  SAD: 'sad',
  SURPRISED: 'surprised',
  CURIOUS: 'curious',
  AFFECTIONATE: 'affectionate',

  // Extended emotions
  EXCITED: 'excited',
  CONTENT: 'content',
  SCARED: 'scared',
  HAPPY: 'happy',
  NOSTALGIC: 'nostalgic',
  CONTEMPLATIVE: 'contemplative',
  GRATEFUL: 'grateful',
  PROUD: 'proud',
  SYMPATHETIC: 'sympathetic',
  SKEPTICAL: 'skeptical',

  // Additional nuanced emotions
  CALM: 'calm',
  THOUGHTFUL: 'thoughtful',
  CONFIDENT: 'confident',
  WARM: 'warm',
  PEACEFUL: 'peaceful',
  ENTHUSIASTIC: 'enthusiastic',
  AMAZED: 'amazed',
  HESITANT: 'hesitant',
  APOLOGETIC: 'apologetic',
  DISAPPOINTED: 'disappointed',
  RESIGNED: 'resigned',
  FRUSTRATED: 'frustrated',
  WISTFUL: 'wistful',
  ANTICIPATION: 'anticipation',
  DETERMINED: 'determined',
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
 */
export const CARTESIA_SUPPORTED_EMOTIONS: CartesiaEmotion[] = [
  CARTESIA_EMOTIONS.ANGRY,
  CARTESIA_EMOTIONS.SAD,
  CARTESIA_EMOTIONS.SURPRISED,
  CARTESIA_EMOTIONS.CURIOUS,
  CARTESIA_EMOTIONS.AFFECTIONATE,
];

/**
 * Check if an emotion value is directly supported in Cartesia's emotion tag
 */
export function isCartesiaSupportedEmotion(emotion: string): boolean {
  return CARTESIA_SUPPORTED_EMOTIONS.includes(emotion as CartesiaEmotion);
}

// =============================================================================
// SSML TAG OPTION TYPES
// =============================================================================

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

/**
 * Configuration for filler injection
 * (imported from speech module but defined here for reference)
 */
export interface FillerConfig {
  /** Probability of injecting a filler (0-1) */
  probability?: number;
  /** Maximum fillers per response */
  maxPerResponse?: number;
  /** Persona-specific filler style */
  personaStyle?: string;
}

/**
 * Configuration for breath group pacing
 */
export interface BreathGroupConfig {
  /** Short pause duration in ms */
  shortPause?: number;
  /** Medium pause duration in ms */
  mediumPause?: number;
  /** Long pause duration in ms */
  longPause?: number;
}

/**
 * Context for thinking time calculation
 */
export interface ThinkingContext {
  /** Question complexity (0-1) */
  complexity?: number;
  /** Topic weight */
  topicWeight?: 'light' | 'medium' | 'heavy';
  /** Whether this is a new topic */
  isNewTopic?: boolean;
  /** Previous thinking pauses used */
  previousPauses?: number;
}

/**
 * Calculated thinking injection
 */
export interface ThinkingInjection {
  /** Pause duration in ms */
  pauseMs: number;
  /** Thinking sound to use (e.g., "hmm", "well") */
  sound?: string;
  /** Position in text */
  position: 'start' | 'middle' | 'end';
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
