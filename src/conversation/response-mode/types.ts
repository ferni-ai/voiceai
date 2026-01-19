/**
 * Response Mode Intelligence Types
 *
 * > "Better than human = superhuman perception + human-like restraint"
 *
 * Knows when NOT to respond fully—sometimes presence beats performance.
 *
 * @module @ferni/conversation/response-mode/types
 */

// ============================================================================
// RESPONSE MODES
// ============================================================================

/**
 * Available response modes
 *
 * - `full` - Normal comprehensive response
 * - `brief` - Short acknowledgment (post-venting)
 * - `presence` - "I'm here" or similar (post-vulnerability)
 * - `silence` - Say nothing, just be present
 * - `clarify` - Ask clarifying question
 * - `invitation` - Gentle invitation to continue
 * - `celebration` - Pure celebration/acknowledgment
 */
export type ResponseMode =
  | 'full'
  | 'brief'
  | 'presence'
  | 'silence'
  | 'clarify'
  | 'invitation'
  | 'celebration';

// ============================================================================
// DECISION TYPES
// ============================================================================

/**
 * Result of response mode decision
 */
export interface ResponseModeDecision {
  /** Selected response mode */
  mode: ResponseMode;

  /** Confidence in decision (0-1) */
  confidence: number;

  /** Human-readable reasoning */
  reasoning: string;

  /** Maximum words for response (mode-specific) */
  maxWords?: number;

  /** Suggested phrase to use */
  suggestedPhrase?: string;

  /** SSML version of suggested phrase */
  suggestedSsml?: string;

  /** Milliseconds to pause before responding */
  pauseBeforeMs?: number;

  /** Content types to avoid in response */
  avoidContent?: string[];
}

/**
 * Context for making response mode decision
 */
export interface ResponseModeContext {
  // Turn characteristics
  /** Word count of user's turn */
  userTurnLength: number;

  /** Emotional intensity of user's turn (0-1) */
  userTurnIntensity: number;

  /** Was user venting/releasing emotions */
  wasVenting: boolean;

  /** Was user sharing something vulnerable */
  wasVulnerable: boolean;

  /** Did user ask a question */
  askedQuestion: boolean;

  // Emotional state
  /** Current detected emotion */
  emotionalState: string;

  /** Emotional trajectory in session */
  trajectory: 'improving' | 'stable' | 'declining' | 'volatile' | 'unknown';

  // Session state
  /** Current turn number */
  turnCount: number;

  /** Minutes into session */
  sessionMinute: number;

  /** Recent response modes used */
  recentResponseModes: ResponseMode[];

  // Content
  /** Current topic being discussed */
  topic?: string;

  /** Overall sentiment of user's message */
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
}

// ============================================================================
// DETECTION INTERFACES
// ============================================================================

/**
 * Result of venting detection
 */
export interface VentingDetectionResult {
  isVenting: boolean;
  intensity: number;
  signals: string[];
}

/**
 * Result of vulnerability detection
 */
export interface VulnerabilityDetectionResult {
  isVulnerable: boolean;
  level: 'low' | 'medium' | 'high';
  markers: string[];
}

/**
 * Result of question detection
 */
export interface QuestionDetectionResult {
  hasQuestion: boolean;
  questionType: 'direct' | 'indirect' | 'rhetorical' | 'none';
}

// ============================================================================
// ENGINE INTERFACE
// ============================================================================

/**
 * Interface for Response Mode Decision Engine
 */
export interface IResponseModeDecider {
  /**
   * Decide response mode for current turn
   *
   * @param context - Turn and session context
   * @returns Decision with mode and guidance
   */
  decide(context: ResponseModeContext): ResponseModeDecision;

  /**
   * Get appropriate content for a given mode
   *
   * @param mode - Response mode
   * @param context - Optional context for personalization
   * @returns Text and SSML content, or null for silence/full modes
   */
  getContentForMode(
    mode: ResponseMode,
    context?: { emotion?: string; topic?: string }
  ): { text: string; ssml: string } | null;

  /**
   * Detect if user is venting
   *
   * @param message - User's message
   * @param intensity - Emotional intensity (0-1)
   * @returns Venting detection result
   */
  detectVenting(message: string, intensity: number): VentingDetectionResult;

  /**
   * Detect if user is being vulnerable
   *
   * @param message - User's message
   * @returns Vulnerability detection result
   */
  detectVulnerability(message: string): VulnerabilityDetectionResult;

  /**
   * Detect if user asked a question
   *
   * @param message - User's message
   * @returns Question detection result
   */
  detectQuestion(message: string): QuestionDetectionResult;

  /**
   * Record outcome for learning
   *
   * @param mode - Mode that was used
   * @param userReaction - How user responded
   */
  recordOutcome(
    mode: ResponseMode,
    userReaction: 'positive' | 'neutral' | 'negative'
  ): void;

  /**
   * Reset state for new session
   */
  reset(): void;
}

// ============================================================================
// RULE TYPES
// ============================================================================

/**
 * Rule for determining response mode
 */
export interface ResponseModeRule {
  /** Condition function */
  condition: (ctx: ResponseModeContext) => boolean;

  /** Mode to use if condition matches */
  mode: ResponseMode;

  /** Maximum words for this mode */
  maxWords?: number;

  /** Suggested phrases for this mode */
  suggestedPhrases?: string[];

  /** Milliseconds to pause before responding */
  pauseBeforeMs?: number;

  /** Priority (lower = higher priority) */
  priority: number;
}

// ============================================================================
// DI TOKEN
// ============================================================================

/**
 * DI token for Response Mode Decider
 */
export const ResponseModeToken = Symbol('ResponseModeDecider');
