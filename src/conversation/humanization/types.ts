/**
 * Humanization Types
 *
 * Shared types for the advanced humanization subsystem.
 *
 * @module @ferni/humanization/types
 */

// ============================================================================
// BASE TYPES
// ============================================================================

/**
 * Placement of humanization injection in response
 */
export type InjectionPlacement =
  | 'opening' // At the start of response
  | 'mid_sentence' // Within a sentence
  | 'between_sentences' // Between two sentences
  | 'before_key_point' // Before important content
  | 'closing'; // At the end

/**
 * Intensity of humanization effect
 */
export type HumanizationIntensity = 'subtle' | 'moderate' | 'pronounced';

/**
 * Base humanization injection result
 */
export interface HumanizationInjection {
  /** Type of humanization */
  type: string;
  /** Content to inject */
  content: string;
  /** SSML version */
  ssml: string;
  /** Where to place it */
  placement: InjectionPlacement;
  /** Why this was triggered */
  reason: string;
}

// ============================================================================
// CONTEXT TYPES
// ============================================================================

/**
 * Full humanization context for decision-making
 */
export interface HumanizationContext {
  // User message info
  userMessage: string;
  userWordCount: number;
  userEmotion?: string;
  userEnergy: 'high' | 'medium' | 'low';

  // Response info
  responseText: string;
  responseWordCount: number;
  responseComplexity: number; // 0-1
  isGivingAdvice: boolean;
  isEmotionalContent: boolean;

  // Session info
  turnCount: number;
  sessionMinutes: number;
  comfortLevel: number; // 0-1

  // Relationship
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

  // Persona
  personaId: string;

  // Recent activity
  recentTopics: string[];
  recentHumanizations: string[]; // Types used recently
}

/**
 * Decision result for whether to apply humanization
 */
export interface HumanizationDecision {
  shouldApply: boolean;
  reason: string;
  cooldownTurns?: number;
}

// ============================================================================
// SESSION STATE
// ============================================================================

/**
 * Tracks humanization usage within a session
 */
export interface HumanizationSessionState {
  sessionId: string;

  // Counts by type
  selfCorrectionCount: number;
  disfluencyCount: number;
  catchingYourselfCount: number;

  // Last usage turn by type
  lastSelfCorrectionTurn: number;
  lastDisfluencyTurn: number;
  lastCatchingYourselfTurn: number;

  // Session dynamics
  currentTurn: number;
  sessionStartTime: number;

  // User patterns learned this session
  userPhoneticPatterns: string[];
  userFillerPreference: string | null;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * Base configuration for humanization features
 */
export interface HumanizationFeatureConfig {
  /** Is this feature enabled? */
  enabled: boolean;

  /** Base probability of triggering (0-1) */
  baseProbability: number;

  /** Maximum uses per session */
  maxPerSession: number;

  /** Minimum turns between uses */
  cooldownTurns: number;

  /** Minimum comfort level required */
  minComfortLevel: number;

  /** Minimum turn to start using */
  minTurnNumber: number;
}

/**
 * Configuration for all humanization features
 */
export interface HumanizationConfig {
  selfCorrection: HumanizationFeatureConfig & {
    /** Multiplier for complex content */
    complexityMultiplier: number;
    /** Multiplier for emotional content */
    emotionalMultiplier: number;
  };

  disfluency: HumanizationFeatureConfig & {
    /** Types of disfluencies to use */
    enabledTypes: Array<
      'filled_pause' | 'discourse_marker' | 'lengthening' | 'false_start' | 'repetition'
    >;
    /** Never use for simple responses */
    skipSimpleResponses: boolean;
  };

  phoneticMirroring: HumanizationFeatureConfig & {
    /** Minimum samples to start mirroring */
    minSamples: number;
    /** How aggressively to mirror (0-1) */
    mirroringStrength: number;
  };

  catchingYourself: HumanizationFeatureConfig & {
    /** Types of catching yourself to use */
    enabledTypes: Array<
      | 'talking_too_much'
      | 'circling_back'
      | 'noticing_pattern'
      | 'checking_understanding'
      | 'energy_mismatch'
    >;
  };
}

// ============================================================================
// PERSONA-SPECIFIC TYPES
// ============================================================================

/**
 * Persona-specific humanization patterns
 */
export interface PersonaHumanizationProfile {
  personaId: string;

  // Self-correction patterns
  selfCorrectionPatterns: {
    restart: string[];
    midSentence: string[];
    refinement: string[];
  };

  // Disfluency preferences
  disfluencyPreferences: {
    filledPauses: string[];
    discourseMarkers: string[];
    probability: number; // Persona-specific probability
  };

  // Catching yourself patterns
  catchingYourselfPatterns: {
    talkingTooMuch: string[];
    circlingBack: string[];
    noticingPattern: string[];
    checkingUnderstanding: string[];
    energyMismatch: string[];
  };

  // Phonetic style
  phoneticStyle: {
    usesReductions: boolean; // gonna, wanna, etc.
    regionalMarkers: string[];
    preferredFillers: string[];
  };
}

// ============================================================================
// RESULT TYPES
// ============================================================================

/**
 * Result of applying humanization to a response
 */
export interface HumanizedResponseResult {
  /** Original response */
  original: string;

  /** Humanized response (plain text) */
  text: string;

  /** Humanized response (SSML) */
  ssml: string;

  /** What was applied */
  appliedHumanizations: HumanizationInjection[];

  /** Features that were considered but not applied */
  skippedFeatures: Array<{
    feature: string;
    reason: string;
  }>;
}

// ============================================================================
// DEFAULTS
// ============================================================================

/**
 * Default humanization configuration
 */
export const DEFAULT_HUMANIZATION_CONFIG: HumanizationConfig = {
  selfCorrection: {
    enabled: true,
    baseProbability: 0.08,
    maxPerSession: 4,
    cooldownTurns: 8,
    minComfortLevel: 0.3,
    minTurnNumber: 3,
    complexityMultiplier: 1.5,
    emotionalMultiplier: 1.3,
  },

  disfluency: {
    enabled: true,
    baseProbability: 0.12,
    maxPerSession: 6,
    cooldownTurns: 4,
    minComfortLevel: 0.2,
    minTurnNumber: 1,
    enabledTypes: ['filled_pause', 'discourse_marker', 'false_start'],
    skipSimpleResponses: true,
  },

  phoneticMirroring: {
    enabled: true,
    baseProbability: 0.9, // High - if we detect patterns, mirror them
    maxPerSession: 100, // No real limit
    cooldownTurns: 0, // Always apply
    minComfortLevel: 0,
    minTurnNumber: 3,
    minSamples: 3,
    mirroringStrength: 0.7,
  },

  catchingYourself: {
    enabled: true,
    baseProbability: 0.15,
    maxPerSession: 3,
    cooldownTurns: 10,
    minComfortLevel: 0.4,
    minTurnNumber: 5,
    enabledTypes: [
      'talking_too_much',
      'circling_back',
      'checking_understanding',
      'energy_mismatch',
    ],
  },
};
