/**
 * Avoidance Pattern Detection Types
 *
 * Detect when users consistently avoid certain topics. Not to push—to understand.
 * Notice patterns humans miss. Over 3 sessions, user always deflects when
 * career comes up. Might gently acknowledge: "I notice we haven't talked much
 * about work..."
 *
 * @module @ferni/intelligence/deep-understanding/avoidance-detection/types
 */

// ============================================================================
// AVOIDANCE SIGNAL TYPES
// ============================================================================

/**
 * Types of avoidance signals we detect
 */
export type AvoidanceSignalType =
  | 'topic_change' // Abrupt topic shift
  | 'vague_response' // Non-committal, surface-level answer
  | 'deflection' // Redirecting to someone/something else
  | 'minimization' // "It's not a big deal"
  | 'humor_shield' // Using humor to avoid depth
  | 'generalization' // "Everyone goes through this"
  | 'time_pressure'; // "We don't have time for that now"

/**
 * A detected avoidance signal
 */
export interface AvoidanceSignal {
  /** Type of avoidance detected */
  type: AvoidanceSignalType;

  /** The text that triggered detection */
  trigger: string;

  /** Confidence in detection (0-1) */
  confidence: number;

  /** What topic was being avoided */
  avoidedTopic: string;

  /** What topic they shifted to (if topic_change) */
  shiftedToTopic?: string;

  /** When detected */
  timestamp: Date;

  /** Turn number in session */
  turnNumber: number;

  /** Session ID */
  sessionId: string;
}

// ============================================================================
// PATTERN TYPES
// ============================================================================

/**
 * Accumulated avoidance pattern (cross-session)
 */
export interface AvoidancePattern {
  /** Topic being avoided */
  topic: string;

  /** Number of times avoidance detected */
  frequency: number;

  /** Types of avoidance used */
  signalTypes: AvoidanceSignalType[];

  /** Sessions where avoidance occurred */
  sessionIds: string[];

  /** First detected */
  firstDetected: Date;

  /** Last detected */
  lastDetected: Date;

  /** Has this been acknowledged to user? */
  acknowledged: boolean;

  /** Strength of pattern (0-1) */
  strength: number;
}

/**
 * Analysis result for a message
 */
export interface AvoidanceAnalysis {
  /** Detected signals in current message */
  signals: AvoidanceSignal[];

  /** Was avoidance detected? */
  hasAvoidance: boolean;

  /** Primary signal (if any) */
  primarySignal?: AvoidanceSignal;

  /** Related patterns from history */
  relatedPatterns: AvoidancePattern[];

  /** Is this a repeat avoidance? */
  isRepeat: boolean;

  /** Suggested approach */
  suggestedApproach: AvoidanceApproach;
}

/**
 * Suggested approach for handling avoidance
 */
export interface AvoidanceApproach {
  /** How to respond */
  action: 'ignore' | 'note' | 'gentle-inquiry' | 'honor-boundary';

  /** Reason for approach */
  reason: string;

  /** If gentle-inquiry, suggested wording */
  suggestedWording?: string;

  /** Topics to avoid mentioning */
  avoidTopics?: string[];
}

// ============================================================================
// DETECTION CONTEXT
// ============================================================================

/**
 * Context for avoidance detection
 */
export interface AvoidanceContext {
  /** Current message */
  message: string;

  /** Previous message (what prompted this response) */
  previousMessage?: string;

  /** Previous topic */
  previousTopic?: string;

  /** Current turn number */
  turnNumber: number;

  /** Session ID */
  sessionId: string;

  /** User ID (for cross-session patterns) */
  userId: string;

  /** Recent topics discussed */
  recentTopics?: string[];
}

// ============================================================================
// ENGINE INTERFACE
// ============================================================================

/**
 * Interface for Avoidance Pattern Detector
 */
export interface IAvoidanceDetector {
  /**
   * Detect avoidance in a message
   *
   * @param context - Message and surrounding context
   * @returns Analysis with detected signals
   */
  detect(context: AvoidanceContext): Promise<AvoidanceAnalysis>;

  /**
   * Get accumulated patterns for a user
   *
   * @param userId - User ID
   * @returns Array of avoidance patterns
   */
  getPatterns(userId: string): Promise<AvoidancePattern[]>;

  /**
   * Get strong patterns (threshold-based)
   *
   * @param userId - User ID
   * @param threshold - Minimum strength (default 0.6)
   * @returns Array of strong patterns
   */
  getStrongPatterns(userId: string, threshold?: number): Promise<AvoidancePattern[]>;

  /**
   * Mark a pattern as acknowledged
   *
   * @param userId - User ID
   * @param topic - Topic that was acknowledged
   */
  acknowledgePattern(userId: string, topic: string): Promise<void>;

  /**
   * Build context injection for LLM
   *
   * @param analysis - Avoidance analysis
   * @returns Context string for injection
   */
  buildContextInjection(analysis: AvoidanceAnalysis): string;

  /**
   * Reset session state
   */
  reset(): void;
}

// ============================================================================
// DETECTION RULES
// ============================================================================

/**
 * Detection rule for avoidance type
 */
export interface AvoidanceRule {
  /** Type of avoidance */
  type: AvoidanceSignalType;

  /** Regex patterns to match */
  patterns: RegExp[];

  /** Base confidence */
  baseConfidence: number;

  /** Description for context injection */
  description: string;
}

// ============================================================================
// DI TOKEN
// ============================================================================

/**
 * DI token for Avoidance Detector
 */
export const AvoidanceDetectorToken = Symbol('AvoidanceDetector');
