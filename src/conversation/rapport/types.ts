/**
 * Rapport Scoring Types
 *
 * Types for real-time conversational health tracking and repair.
 *
 * @module rapport/types
 */

// ============================================================================
// RAPPORT SCORE
// ============================================================================

/**
 * Rapport score level thresholds
 */
export type RapportLevel = 'excellent' | 'good' | 'needs_attention' | 'repair_needed' | 'critical';

/**
 * Individual signal contributing to rapport score
 */
export interface RapportSignal {
  /** Signal name */
  name: string;

  /** Raw value (0-1) */
  value: number;

  /** Weight in final score (0-1) */
  weight: number;

  /** Weighted contribution to score */
  contribution: number;

  /** When this signal was last updated */
  lastUpdatedAt: number;
}

/**
 * Complete rapport score with breakdown
 */
export interface RapportScore {
  /** Overall score (0-100) */
  score: number;

  /** Level classification */
  level: RapportLevel;

  /** Individual signal breakdown */
  signals: RapportSignal[];

  /** Confidence in the score (0-1) */
  confidence: number;

  /** Trend direction */
  trend: 'improving' | 'declining' | 'stable';

  /** Rate of change (points per turn) */
  trendRate: number;

  /** Timestamp of calculation */
  calculatedAt: number;
}

// ============================================================================
// SIGNAL OBSERVATIONS
// ============================================================================

/**
 * Turn balance observation
 * Measures if agent talks too much or too little
 */
export interface TurnBalanceObservation {
  /** Agent's words in this turn */
  agentWordCount: number;

  /** User's words in this turn */
  userWordCount: number;

  /** Agent's talk time (ms) */
  agentTalkTimeMs: number;

  /** User's talk time (ms) */
  userTalkTimeMs: number;
}

/**
 * Interruption observation
 * Whether interruptions are collaborative or disruptive
 */
export interface InterruptionObservation {
  /** Did agent interrupt user? */
  agentInterrupted: boolean;

  /** Did user interrupt agent? */
  userInterrupted: boolean;

  /** Was interruption collaborative (building on idea)? */
  wasCollaborative: boolean;

  /** Overlap duration (ms) */
  overlapMs: number;
}

/**
 * Engagement observation
 * User's level of engagement in conversation
 */
export interface EngagementObservation {
  /** User's response length (short = low engagement) */
  responseLength: 'short' | 'medium' | 'long';

  /** User asked a question (high engagement signal) */
  userAskedQuestion: boolean;

  /** User elaborated on previous topic */
  userElaborated: boolean;

  /** User introduced new topic */
  userIntroducedTopic: boolean;

  /** User showed emotional expression */
  userShowedEmotion: boolean;
}

/**
 * Emotional alignment observation
 * Whether agent's emotion matches user's needs
 */
export interface EmotionalAlignmentObservation {
  /** User's emotional state */
  userEmotion: string;

  /** Agent's expressed emotion */
  agentEmotion: string;

  /** Are emotions appropriately aligned? */
  isAligned: boolean;

  /** User's energy level (0-1) */
  userEnergy: number;

  /** Agent's energy level (0-1) */
  agentEnergy: number;
}

/**
 * Flow continuity observation
 * Is conversation flowing naturally?
 */
export interface FlowContinuityObservation {
  /** Silence duration before response (ms) */
  silenceDurationMs: number;

  /** Was there a topic shift? */
  topicShift: boolean;

  /** Was transition smooth? */
  smoothTransition: boolean;

  /** Turn gap felt natural? */
  naturalPacing: boolean;
}

/**
 * Trust signal observation
 * Signals of user trust/comfort
 */
export interface TrustSignalObservation {
  /** User disclosed personal information */
  userDisclosed: boolean;

  /** User showed vulnerability */
  userShowedVulnerability: boolean;

  /** User asked for advice/help */
  userAskedForHelp: boolean;

  /** User expressed skepticism */
  userExpressedSkepticism: boolean;

  /** User's comfort level (0-1) */
  comfortLevel: number;
}

/**
 * Combined observation for a turn
 */
export interface TurnObservation {
  /** Turn number */
  turnNumber: number;

  /** Timestamp */
  timestamp: number;

  /** Turn balance signals */
  turnBalance?: TurnBalanceObservation;

  /** Interruption signals */
  interruption?: InterruptionObservation;

  /** Engagement signals */
  engagement?: EngagementObservation;

  /** Emotional alignment signals */
  emotionalAlignment?: EmotionalAlignmentObservation;

  /** Flow continuity signals */
  flowContinuity?: FlowContinuityObservation;

  /** Trust signals */
  trustSignals?: TrustSignalObservation;
}

// ============================================================================
// REPAIR STRATEGIES
// ============================================================================

/**
 * Types of repair strategies
 */
export type RepairStrategyType =
  | 'validate_feeling' // Lead with validation
  | 'slow_down' // Speed 0.85x, add pauses
  | 'check_in' // Ask how they're doing
  | 'give_space' // More pauses, less talking
  | 'show_interest' // More engagement cues
  | 'none'; // No repair needed

/**
 * A repair strategy recommendation
 */
export interface RepairStrategy {
  /** Strategy type */
  type: RepairStrategyType;

  /** Priority (higher = more urgent) */
  priority: number;

  /** Reason for recommendation */
  reason: string;

  /** Suggested TTS adjustments */
  ttsAdjustments?: {
    speedMultiplier?: number;
    extraPauseMs?: number;
    volumeAdjust?: number;
  };

  /** Suggested context injection for LLM */
  contextInjection?: string;

  /** When this was recommended */
  recommendedAt: number;
}

/**
 * Active repair state
 */
export interface RepairState {
  /** Currently active strategy (if any) */
  activeStrategy: RepairStrategy | null;

  /** Turns since repair started */
  turnsSinceRepairStarted: number;

  /** Has rapport improved since repair? */
  isImproving: boolean;

  /** History of recent strategies tried */
  recentStrategies: RepairStrategyType[];
}

// ============================================================================
// SCORER STATE
// ============================================================================

/**
 * Full state of the rapport scorer
 */
export interface RapportScorerState {
  /** Session ID */
  sessionId: string;

  /** Current rapport score */
  currentScore: RapportScore;

  /** Historical scores (last N) */
  scoreHistory: RapportScore[];

  /** Current repair state */
  repairState: RepairState;

  /** Total observations processed */
  observationCount: number;

  /** Session start time */
  sessionStartedAt: number;
}
