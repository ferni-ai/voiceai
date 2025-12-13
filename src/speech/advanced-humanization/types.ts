/**
 * Advanced Humanization Types
 *
 * Type definitions for the voice humanization system.
 *
 * @module advanced-humanization/types
 */

// ============================================================================
// CARTESIA EMOTIONS
// ============================================================================

/**
 * Cartesia Sonic-3 supported emotions organized by category
 */
export const CARTESIA_EMOTIONS = {
  // Positive emotions
  positive: [
    'happy',
    'excited',
    'enthusiastic',
    'elated',
    'euphoric',
    'triumphant',
    'content',
    'peaceful',
    'serene',
    'calm',
    'grateful',
    'affectionate',
    'trust',
    'sympathetic',
    'flirtatious',
  ],

  // Engagement emotions
  engagement: [
    'curious',
    'amazed',
    'surprised',
    'anticipation',
    'mysterious',
    'joking',
    'comedic',
    'sarcastic',
    'ironic',
  ],

  // Negative emotions
  negative: [
    'sad',
    'dejected',
    'melancholic',
    'disappointed',
    'hurt',
    'angry',
    'mad',
    'outraged',
    'frustrated',
    'agitated',
    'threatened',
    'scared',
    'disgusted',
    'contempt',
    'envious',
  ],

  // Nuanced states
  nuanced: [
    'hesitant',
    'insecure',
    'confused',
    'resigned',
    'guilty',
    'bored',
    'tired',
    'rejected',
    'nostalgic',
    'wistful',
    'apologetic',
  ],
} as const;

/**
 * All Cartesia emotions flattened into a single array
 */
export const ALL_CARTESIA_EMOTIONS = [
  ...CARTESIA_EMOTIONS.positive,
  ...CARTESIA_EMOTIONS.engagement,
  ...CARTESIA_EMOTIONS.negative,
  ...CARTESIA_EMOTIONS.nuanced,
] as const;

/**
 * Type representing any valid Cartesia emotion
 */
export type CartesiaEmotion = (typeof ALL_CARTESIA_EMOTIONS)[number];

// ============================================================================
// EMOTION CONTEXT
// ============================================================================

/**
 * Context for emotion mapping decisions
 */
export interface EmotionContext {
  /** What the agent is doing */
  agentIntent:
    | 'supportive'
    | 'thinking'
    | 'explaining'
    | 'celebrating'
    | 'comforting'
    | 'joking'
    | 'remembering'
    | 'questioning'
    | 'uncertain'
    | 'apologizing'
    | 'encouraging'
    | 'reflecting';

  /** User's emotional state (if detected) */
  userEmotion?: 'happy' | 'sad' | 'anxious' | 'frustrated' | 'neutral' | 'excited';

  /** Conversation weight */
  topicWeight: 'light' | 'medium' | 'heavy';

  /** Relationship depth */
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

  /** Optional: Current persona */
  personaId?: string;
}

// ============================================================================
// FILLER CONFIGURATION
// ============================================================================

/**
 * Configuration for natural filler injection
 */
export interface FillerConfig {
  /** Probability of adding filler (0-1) */
  probability: number;

  /** Max fillers per response */
  maxPerResponse: number;

  /** Persona-specific filler preference */
  preferredFillers?: string[];
}

/**
 * Default filler configuration
 */
export const DEFAULT_FILLER_CONFIG: FillerConfig = {
  probability: 0.12, // 12% chance at injection points
  maxPerResponse: 2,
};

// ============================================================================
// BREATH GROUP CONFIGURATION
// ============================================================================

/**
 * Configuration for breath group pacing
 */
export interface BreathGroupConfig {
  /** Short pause (ms) for minor boundaries */
  shortPause: number;

  /** Medium pause (ms) for clause boundaries */
  mediumPause: number;

  /** Long pause (ms) for sentence boundaries */
  longPause: number;

  /** Enable breath group detection */
  enabled: boolean;
}

/**
 * Default breath group configuration
 */
export const DEFAULT_BREATH_CONFIG: BreathGroupConfig = {
  shortPause: 120,
  mediumPause: 220,
  longPause: 350,
  enabled: true,
};

// ============================================================================
// RHYTHM VARIATION
// ============================================================================

/**
 * Speech rhythm variation for a text segment
 */
export interface RhythmVariation {
  /** Speed multiplier for this segment */
  speedRatio: number;

  /** Text content */
  content: string;
}

// ============================================================================
// HUMANIZATION OPTIONS
// ============================================================================

/**
 * Options for the humanization pipeline
 */
export interface HumanizationOptions {
  /** Enable filler injection */
  fillers: boolean;

  /** Enable breath group pacing */
  breathGroups: boolean;

  /** Enable rhythm variation */
  rhythmVariation: boolean;

  /** Enable emotion mapping */
  emotionMapping: boolean;

  /** Filler configuration */
  fillerConfig?: FillerConfig;

  /** Breath group configuration */
  breathConfig?: BreathGroupConfig;

  /** Persona ID for persona-specific adjustments */
  personaId?: string;

  /** Emotion context for mapping */
  emotionContext?: EmotionContext;
}

/**
 * Default humanization options
 */
export const DEFAULT_HUMANIZATION_OPTIONS: HumanizationOptions = {
  fillers: true,
  breathGroups: true,
  rhythmVariation: true,
  emotionMapping: true,
};

