/**
 * Micro-Moment Recognition Types
 *
 * Catch the small moments humans miss. The micro-shifts that signal growth,
 * vulnerability, or change. These moments deserve acknowledgment.
 *
 * @module @ferni/intelligence/deep-understanding/micro-moments/types
 */

// ============================================================================
// MICRO-MOMENT TYPES
// ============================================================================

/**
 * Types of micro-moments we detect
 */
export type MicroMomentType =
  | 'vulnerability-edge'    // "I've never told anyone..."
  | 'small-win'            // "I almost made it to..."
  | 'relationship-shift'   // Changed how they refer to someone
  | 'language-change'      // "We" instead of "I"
  | 'hope-glimmer'         // "Maybe things could..."
  | 'self-compassion'      // "I guess it's okay that..."
  | 'boundary-attempt'     // Trying to set limits
  | 'growth-evidence';     // Evidence of change

/**
 * A detected micro-moment
 */
export interface MicroMoment {
  /** Type of moment detected */
  type: MicroMomentType;

  /** The text that triggered detection */
  trigger: string;

  /** Confidence in detection (0-1) */
  confidence: number;

  /** Position in message (start, middle, end) */
  position: 'start' | 'middle' | 'end';

  /** Suggested acknowledgment */
  acknowledgment: MicroMomentAcknowledgment;

  /** Context about what was detected */
  context: {
    /** Previous state (for shifts) */
    previousPattern?: string;
    /** Current state (for shifts) */
    currentPattern?: string;
    /** Topic area */
    topic?: string;
    /** Related entities mentioned */
    entities?: string[];
  };

  /** When detected */
  timestamp: Date;
}

/**
 * Acknowledgment for a micro-moment
 */
export interface MicroMomentAcknowledgment {
  /** Type of acknowledgment */
  type: 'verbal' | 'presence' | 'celebration' | 'gentle-mirror';

  /** Suggested phrase (plain text) */
  phrase: string;

  /** SSML version with prosody */
  ssml: string;

  /** Should this be said out loud or noted for later? */
  timing: 'immediate' | 'weave-in' | 'remember';

  /** How long to pause before acknowledgment (ms) */
  pauseBeforeMs: number;
}

// ============================================================================
// DETECTION RESULTS
// ============================================================================

/**
 * Result of analyzing a message for micro-moments
 */
export interface MicroMomentAnalysis {
  /** All detected micro-moments */
  moments: MicroMoment[];

  /** Was there at least one significant moment? */
  hasSignificantMoment: boolean;

  /** The most significant moment (if any) */
  primaryMoment?: MicroMoment;

  /** Summary for context injection */
  summary: string;
}

/**
 * Context for micro-moment detection
 */
export interface MicroMomentContext {
  /** Current message to analyze */
  message: string;

  /** Previous messages in session (for comparison) */
  previousMessages?: string[];

  /** Known relationship names and how user refers to them */
  relationshipPatterns?: Map<string, string[]>;

  /** User's typical language patterns */
  languageBaseline?: {
    usesWeFrequency: number; // 0-1 how often they say "we"
    selfReferencesPositively: boolean;
    typicalBoundaryStrength: 'weak' | 'moderate' | 'strong';
  };

  /** Current emotional context */
  emotionalState?: string;

  /** Current topic */
  topic?: string;
}

// ============================================================================
// ENGINE INTERFACE
// ============================================================================

/**
 * Interface for Micro-Moment Detector
 */
export interface IMicroMomentDetector {
  /**
   * Detect micro-moments in a message
   *
   * @param context - Message and surrounding context
   * @returns Analysis with detected moments
   */
  detect(context: MicroMomentContext): MicroMomentAnalysis;

  /**
   * Get acknowledgment for a specific moment
   *
   * @param moment - The micro-moment
   * @returns Suggested acknowledgment
   */
  getAcknowledgment(moment: MicroMoment): MicroMomentAcknowledgment;

  /**
   * Build context injection for LLM
   *
   * @param analysis - Micro-moment analysis
   * @returns Context string for injection
   */
  buildContextInjection(analysis: MicroMomentAnalysis): string;

  /**
   * Record that a moment was acknowledged (for learning)
   *
   * @param moment - The moment that was acknowledged
   * @param userReaction - How user responded
   */
  recordOutcome(
    moment: MicroMoment,
    userReaction: 'positive' | 'neutral' | 'negative'
  ): void;

  /**
   * Reset for new session
   */
  reset(): void;
}

// ============================================================================
// DETECTION RULES
// ============================================================================

/**
 * Detection rule for a micro-moment type
 */
export interface MicroMomentRule {
  /** Type of moment this rule detects */
  type: MicroMomentType;

  /** Regex patterns to match */
  patterns: RegExp[];

  /** Keywords that increase confidence */
  keywords: string[];

  /** Base confidence for this rule */
  baseConfidence: number;

  /** Default acknowledgment type */
  defaultAcknowledgment: MicroMomentAcknowledgment['type'];

  /** Default timing */
  defaultTiming: MicroMomentAcknowledgment['timing'];

  /** Default pause before acknowledgment */
  defaultPauseMs: number;
}

// ============================================================================
// DI TOKEN
// ============================================================================

/**
 * DI token for Micro-Moment Detector
 */
export const MicroMomentToken = Symbol('MicroMomentDetector');
