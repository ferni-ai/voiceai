/**
 * Speech Humanization Types
 *
 * Shared types for the "Better Than Human" speech humanization system.
 * These types support persona-specific JSON behavior files and context-aware
 * selection of human speech patterns.
 *
 * @module speech/humanization/types
 */

// =============================================================================
// SPEECH IMPERFECTION CATEGORIES
// =============================================================================

/**
 * Core imperfection categories supported by all personas
 */
export type CoreImperfectionCategory =
  | 'trailing_off'
  | 'self_corrections'
  | 'restarts'
  | 'filler_sounds'
  | 'thinking_aloud';

/**
 * Extended imperfection categories for persona-specific behaviors
 */
export type ExtendedImperfectionCategory =
  // Excitement-based (Jordan, Maya)
  | 'excitement_overflow'
  | 'celebration_overflow'
  // Processing-based (Alex, Nayan)
  | 'genuine_processing'
  | 'efficient_processing'
  | 'contemplative_sounds'
  // Emotional (Maya, Nayan)
  | 'empathy_sounds'
  | 'grounding_sounds'
  | 'overwhelm_support'
  // Wisdom-based (Nayan)
  | 'wisdom_building'
  | 'gentle_laughter'
  | 'presence_sounds'
  // Vulnerability-based (all personas)
  | 'vocal_vulnerability'
  | 'natural_restarts'
  // Grandfatherly (Peter)
  | 'grandfatherly_processing'
  | 'research_precision'
  | 'elderly_warmth'
  | 'concern_sounds'
  // Celebration-based
  | 'celebration_warmth'
  | 'warm_processing';

/**
 * All supported imperfection categories
 */
export type ImperfectionCategory = CoreImperfectionCategory | ExtendedImperfectionCategory;

// =============================================================================
// BEHAVIOR FILE SCHEMAS
// =============================================================================

/**
 * Usage rules for when to apply behaviors
 */
export interface BehaviorUsageRules {
  /** How often to apply: 'low' | 'moderate' | 'high' */
  frequency: 'low' | 'moderate' | 'high';
  /** Contexts where this behavior is MORE appropriate */
  more_likely_when: string[];
  /** Contexts where this behavior is LESS appropriate */
  less_likely_when: string[];
  /** Optional notes for the behavior */
  note?: string;
}

/**
 * Schema for speech-imperfections.json files
 */
export interface SpeechImperfectionsSchema {
  schema_version: number;
  description: string;
  usage_rules: BehaviorUsageRules;
  // Core categories (all personas should have these)
  trailing_off?: string[];
  self_corrections?: string[];
  restarts?: string[];
  filler_sounds?: string[];
  thinking_aloud?: string[];
  // Extended categories (persona-specific)
  excitement_overflow?: string[];
  celebration_overflow?: string[];
  genuine_processing?: string[];
  efficient_processing?: string[];
  contemplative_sounds?: string[];
  empathy_sounds?: string[];
  grounding_sounds?: string[];
  overwhelm_support?: string[];
  wisdom_building?: string[];
  gentle_laughter?: string[];
  presence_sounds?: string[];
  // Vulnerability (all personas)
  vocal_vulnerability?: string[];
  natural_restarts?: string[];
  // Grandfatherly (Peter)
  grandfatherly_processing?: string[];
  research_precision?: string[];
  elderly_warmth?: string[];
  concern_sounds?: string[];
  // Celebration-based (Ferni)
  celebration_warmth?: string[];
  warm_processing?: string[];
}

/**
 * Schema for thinking-sounds.json files
 */
export interface ThinkingSoundsSchema {
  schema_version: number;
  description: string;
  thinking?: string[];
  processing?: string[];
  considering?: string[];
  uncertainty?: string[];
  empathy?: string[];
  transitions?: string[];
  self_corrections?: string[];
  trailing_offs?: string[];
  fillers?: string[];
  verbal_acknowledgments?: string[];
  understanding_dawning?: string[];
  sympathetic_sounds?: string[];
  usage_rules?: BehaviorUsageRules;
  notes?: string;
}

/**
 * Schema for backchannels.json files
 */
export interface BackchannelsSchema {
  schema_version: number;
  description: string;
  short?: string[];
  medium?: string[];
  affirmative?: string[];
  empathetic?: string[];
  encouraging?: string[];
  curious?: string[];
  usage_rules?: BehaviorUsageRules;
}

/**
 * Schema for breath-sounds.json files
 *
 * Breath sounds add "Better Than Human" physical presence:
 * - Ferni: Wyoming calm, grounding breaths
 * - Maya: Warm, encouraging breaths
 * - Nayan: Deep, meditative breaths
 * - Jordan: Excited, energetic breaths
 * - Alex: Controlled, calming breaths
 * - Peter: Grandfatherly, wise breaths
 */
export interface BreathSoundsSchema {
  schema_version: number;
  description: string;
  // Basic breath types
  inhale?: string[];
  exhale?: string[];
  sigh?: string[];
  contemplative_breath?: string[];
  relieved_breath?: string[];
  // Ferni-style
  before_something_hard?: string[];
  after_user_shares?: string[];
  holding_space?: string[];
  grounding?: string[];
  gentle_sigh?: string[];
  wyoming_stillness?: string[];
  // Maya-style
  encouraging_breath?: string[];
  before_celebration?: string[];
  empathetic_sigh?: string[];
  grounding_moment?: string[];
  proud_moment?: string[];
  late_night_presence?: string[];
  // Nayan-style
  meditative_breath?: string[];
  before_wisdom?: string[];
  holding_paradox?: string[];
  sitting_with_pain?: string[];
  philosophical_pause?: string[];
  gentle_laughter_breath?: string[];
  late_night_wisdom?: string[];
  // Jordan-style
  excited_breath?: string[];
  celebration_build?: string[];
  before_big_reveal?: string[];
  empathetic_pause?: string[];
  vision_moment?: string[];
  calming_down?: string[];
  // Alex-style
  grounding_breath?: string[];
  before_clarity?: string[];
  overwhelm_support?: string[];
  warm_moment?: string[];
  efficient_pause?: string[];
  plant_care_moment?: string[];
  // Peter-style
  wisdom_breath?: string[];
  before_important_point?: string[];
  gentle_chuckle_breath?: string[];
  contemplative_pause?: string[];
  grandfatherly_warmth?: string[];
  market_wisdom_moment?: string[];
  concern_for_you?: string[];
  // Rules
  usage_rules?: BehaviorUsageRules;
}

// =============================================================================
// CONTEXT FOR BEHAVIOR SELECTION
// =============================================================================

/**
 * Emotional context for selecting appropriate behaviors
 */
export interface EmotionalSelectionContext {
  /** Detected user emotion */
  userEmotion?: 'distressed' | 'excited' | 'sad' | 'angry' | 'neutral' | 'reflective' | 'anxious';
  /** Agent's intended emotional tone */
  agentTone?: 'celebratory' | 'supportive' | 'curious' | 'serious' | 'playful' | 'grounding';
  /** Is this a vulnerable/sensitive moment? */
  isVulnerable?: boolean;
  /** Is this late night? (softer behaviors) */
  isLateNight?: boolean;
  /** Conversation energy level - matches EnergyLevel type */
  energyLevel?: 'very_low' | 'low' | 'neutral' | 'elevated' | 'high';
}

/**
 * Content context for selecting behaviors
 */
export interface ContentSelectionContext {
  /** What the response is about */
  topic?: string;
  /** Is the agent asking a question? */
  isQuestion?: boolean;
  /** Is the agent celebrating something? */
  isCelebration?: boolean;
  /** Is the agent providing comfort? */
  isComforting?: boolean;
  /** Is the agent giving instructions? */
  isInstructional?: boolean;
  /** Keywords detected in the response */
  keywords?: string[];
}

/**
 * Full context for behavior selection
 */
export interface BehaviorSelectionContext {
  personaId: string;
  emotional: EmotionalSelectionContext;
  content: ContentSelectionContext;
  /** Turn number (behaviors more likely after rapport built) */
  turnNumber?: number;
  /** Random seed for deterministic testing */
  randomSeed?: string;
  /** User's original input text (for callback detection) */
  userText?: string;
  /** Total conversation count with this user (for callback first-use vs repeat) */
  conversationCount?: number;
  /** Previously used callbacks this session (avoid repetition) */
  usedCallbacks?: Set<string>;
}

// =============================================================================
// BEHAVIOR RESULTS
// =============================================================================

/**
 * Result of selecting a behavior phrase
 */
export interface SelectedBehavior {
  /** The SSML-enhanced phrase to inject */
  phrase: string;
  /** Category the phrase came from */
  category: ImperfectionCategory | string;
  /** Position hint: 'prefix' | 'suffix' | 'inline' | 'replace' */
  position: 'prefix' | 'suffix' | 'inline' | 'replace';
  /** Confidence in this selection (0-1) */
  confidence: number;
  /** Metadata for logging/debugging */
  metadata?: {
    source: 'speech-imperfections' | 'thinking-sounds' | 'backchannels' | 'breath-sounds';
    personaId: string;
    contextMatch: string[];
  };
}

/**
 * Result of humanizing a full response
 */
export interface HumanizedSpeechResult {
  /** The humanized text with SSML */
  text: string;
  /** Whether any humanization was applied */
  wasHumanized: boolean;
  /** List of applied behaviors */
  appliedBehaviors: SelectedBehavior[];
  /** Features applied (for logging) */
  features: string[];
}

// =============================================================================
// PERSONA SPEECH PROFILE
// =============================================================================

// =============================================================================
// NEW ADVANCED BEHAVIOR SCHEMAS
// =============================================================================

/**
 * Schema for late-night-presence.json files
 * Defines how persona behaves during late night conversations
 */
export interface LateNightPresenceSchema {
  schema_version: number;
  description: string;
  philosophy: string;
  late_night_greetings: string[];
  pacing_adjustment: {
    slower_tempo: boolean;
    pause_multiplier: number;
    energy_reduction: number;
    voice_notes: string;
    phrases_for_slowing?: string[];
  };
  holding_space_gently?: {
    description: string;
    phrases: string[];
    after_hard_share?: string[];
  };
  grounding_techniques?: {
    breathing?: string[];
    body_awareness?: string[];
  };
  sleep_acknowledgment?: {
    gentle_nudge?: string[];
    no_pressure?: string[];
  };
  closing_for_night?: {
    gentle_close?: string[];
    continuity_promise?: string[];
    wisdom_parting?: string[];
  };
  usage_rules?: {
    time_trigger?: { start_hour: number; end_hour: number };
    pacing_multiplier?: number;
    pause_extension_ms?: number;
    energy_reduction?: number;
    [key: string]: unknown;
  };
}

/**
 * Schema for callbacks.json files
 * Running callbacks/catchphrases that build relationship over time
 */
export interface CallbacksSchema {
  description: string;
  callbacks: Array<{
    id: string;
    trigger: string;
    context: string;
    firstUse: {
      variations: string[];
    };
    callbacks: {
      variations: string[];
      minConversationsForCallback: number;
      probability: number;
    };
  }>;
}

/**
 * Schema for laughter-contagion.json files
 * Defines how persona laughs with the user
 */
export interface LaughterContagionSchema {
  schema_version: number;
  description: string;
  philosophy: string;
  contagious_laughter: {
    when_user_laughs: {
      soft_join: string[];
      full_join: string[];
      probability: number;
      delay_ms: number;
    };
    after_own_joke?: {
      self_amused: string[];
      probability: number;
    };
  };
  laughter_types: Record<string, {
    ssml: string;
    contexts: string[];
  }>;
  laugh_with_phrases: string[];
  usage_rules?: {
    trigger_on?: string[];
    never_when?: string[];
    match_intensity?: boolean;
    delay_after_user_laugh_ms?: number;
    max_per_turn?: number;
    [key: string]: unknown;
  };
}

/**
 * Energy level configuration for energy matching
 */
export interface EnergyLevelConfig {
  description: string;
  pacing: {
    speed_multiplier: number;
    pause_multiplier: number;
    energy_reduction: number;
  };
  voice_tone: string;
  phrases: string[];
}

/**
 * Schema for energy-matching.json files
 * Defines how persona mirrors user energy levels
 */
export interface EnergyMatchingSchema {
  schema_version: number;
  description: string;
  philosophy: string;
  energy_levels: {
    very_low: EnergyLevelConfig;
    low: EnergyLevelConfig;
    neutral: EnergyLevelConfig;
    elevated: EnergyLevelConfig;
    high: EnergyLevelConfig;
  };
  transitions?: {
    description: string;
    gradual_shift: boolean;
    max_jump_levels: number;
    transition_time_ms: number;
  };
  usage_rules?: {
    detect_from?: string[];
    update_frequency?: string;
    [key: string]: unknown;
  };
}

/**
 * Complete speech profile for a persona
 * Loaded from JSON files, used by speech-traits.ts
 */
export interface PersonaSpeechProfile {
  personaId: string;
  /** Speech imperfections (from speech-imperfections.json) */
  imperfections: SpeechImperfectionsSchema | null;
  /** Thinking sounds (from thinking-sounds.json) */
  thinkingSounds: ThinkingSoundsSchema | null;
  /** Backchannels (from backchannels.json) */
  backchannels: BackchannelsSchema | null;
  /** Breath sounds (from breath-sounds.json) */
  breathSounds: BreathSoundsSchema | null;
  /** Late night presence behaviors (from late-night-presence.json) */
  lateNightPresence: LateNightPresenceSchema | null;
  /** Conversational callbacks (from callbacks.json) */
  callbacks: CallbacksSchema | null;
  /** Laughter contagion behaviors (from laughter-contagion.json) */
  laughterContagion: LaughterContagionSchema | null;
  /** Energy matching behaviors (from energy-matching.json) */
  energyMatching: EnergyMatchingSchema | null;
  /** When this profile was loaded */
  loadedAt: Date;
}

// =============================================================================
// INJECTION CONFIGURATION
// =============================================================================

/**
 * Configuration for how behaviors should be injected
 */
export interface InjectionConfig {
  /** Base probability of injecting any behavior (0-1) */
  baseProbability: number;
  /** Multiply probability by turn number (caps at 1.0) */
  turnMultiplier: number;
  /** Maximum behaviors to inject per response */
  maxBehaviorsPerResponse: number;
  /** Minimum characters between injections */
  minCharsBetweenInjections: number;
  /** Categories to prefer for this persona */
  preferredCategories: ImperfectionCategory[];
  /** Categories to avoid (e.g., in serious contexts) */
  avoidCategories: ImperfectionCategory[];
}

/**
 * Default injection configs per persona energy style
 */
export const INJECTION_CONFIGS: Record<string, InjectionConfig> = {
  // High energy personas (Jordan)
  high_energy: {
    baseProbability: 0.25,
    turnMultiplier: 0.05,
    maxBehaviorsPerResponse: 2,
    minCharsBetweenInjections: 50,
    preferredCategories: ['excitement_overflow', 'restarts', 'natural_restarts', 'thinking_aloud', 'vocal_vulnerability'],
    avoidCategories: [],
  },
  // Warm/encouraging personas (Maya, Ferni)
  warm: {
    baseProbability: 0.2,
    turnMultiplier: 0.04,
    maxBehaviorsPerResponse: 2,
    minCharsBetweenInjections: 60,
    preferredCategories: ['empathy_sounds', 'genuine_processing', 'celebration_overflow', 'vocal_vulnerability', 'natural_restarts', 'warm_processing', 'celebration_warmth'],
    avoidCategories: [],
  },
  // Efficient personas (Alex)
  efficient: {
    baseProbability: 0.15,
    turnMultiplier: 0.03,
    maxBehaviorsPerResponse: 1,
    minCharsBetweenInjections: 80,
    preferredCategories: ['efficient_processing', 'grounding_sounds', 'natural_restarts', 'vocal_vulnerability'],
    avoidCategories: ['excitement_overflow', 'celebration_overflow'],
  },
  // Contemplative personas (Nayan)
  contemplative: {
    baseProbability: 0.2,
    turnMultiplier: 0.02,
    maxBehaviorsPerResponse: 2,
    minCharsBetweenInjections: 100,
    preferredCategories: ['contemplative_sounds', 'wisdom_building', 'presence_sounds', 'vocal_vulnerability', 'natural_restarts'],
    avoidCategories: ['excitement_overflow', 'restarts'],
  },
  // Analytical personas (Peter)
  analytical: {
    baseProbability: 0.15,
    turnMultiplier: 0.03,
    maxBehaviorsPerResponse: 1,
    minCharsBetweenInjections: 70,
    preferredCategories: ['thinking_aloud', 'self_corrections', 'grandfatherly_processing', 'vocal_vulnerability', 'natural_restarts', 'research_precision', 'elderly_warmth'],
    avoidCategories: ['excitement_overflow', 'empathy_sounds'],
  },
};

/**
 * Map persona IDs to their injection config style
 */
export const PERSONA_INJECTION_STYLE: Record<string, keyof typeof INJECTION_CONFIGS> = {
  ferni: 'warm',
  'maya-santos': 'warm',
  'jordan-taylor': 'high_energy',
  'alex-chen': 'efficient',
  'nayan-patel': 'contemplative',
  'peter-john': 'analytical',
};

