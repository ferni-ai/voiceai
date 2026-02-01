/**
 * Emotional Momentum Types
 *
 * Track emotional trajectory within conversation, not just point-in-time emotion.
 *
 * @module @ferni/conversation/emotional-arc/momentum/types
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Snapshot of emotional state at a specific turn
 */
export interface EmotionSnapshot {
  /** Turn number */
  turn: number;

  /** Timestamp */
  timestamp: Date;

  /** Primary emotion detected */
  emotion: string;

  /** Valence (-1 negative to 1 positive) */
  valence: number;

  /** Arousal (0 calm to 1 activated) */
  arousal: number;

  /** Topic being discussed */
  topic?: string;

  /** What triggered this emotional state */
  trigger?: string;
}

/**
 * Emotional trajectory classification
 */
export type EmotionalTrajectory =
  | 'improving' // Getting more positive
  | 'declining' // Getting more negative
  | 'stable-positive' // Steady positive
  | 'stable-negative' // Steady negative
  | 'volatile' // Rapidly changing
  | 'recovering' // Coming back from negative
  | 'spiral-down'; // Accelerating negative (needs intervention)

/**
 * A turning point in the conversation
 */
export interface TurningPoint {
  /** Turn when it happened */
  turn: number;

  /** What triggered the shift */
  trigger: string;

  /** Topic at time of shift */
  topic: string;

  /** Direction of shift */
  direction: 'up' | 'down';

  /** Magnitude of shift */
  magnitude: 'slight' | 'moderate' | 'significant';

  /** Actual valence change */
  valenceShift: number;
}

/**
 * Prediction of emotional trajectory
 */
export interface TrajectoryPrediction {
  /** Predicted end state */
  likelyEndState: string;

  /** Confidence in prediction (0-1) */
  confidence: number;

  /** Turns until emotional peak (if improving) */
  turnsUntilPeak: number | null;

  /** Turns until emotional trough (if declining) */
  turnsUntilTrough: number | null;

  /** Risk factors identified */
  riskFactors: string[];
}

/**
 * Guidance for intervention
 */
export interface InterventionGuidance {
  /** Type of intervention */
  type: 'redirect' | 'validate' | 'ground' | 'celebrate' | 'rest';

  /** When to intervene */
  timing: 'immediate' | 'next-turn' | 'natural-pause';

  /** Script to use */
  script?: string;

  /** Topics to avoid */
  avoidTopics: string[];

  /** Topic to return to (one that improved mood) */
  returnToTopic?: string;
}

// ============================================================================
// MOMENTUM STATE
// ============================================================================

/**
 * Complete emotional momentum state for a session
 */
export interface EmotionalMomentum {
  /** Session identifier */
  sessionId: string;

  /** Starting emotional state */
  startingState: EmotionSnapshot;

  /** Current emotional state */
  currentState: EmotionSnapshot;

  /** All recorded snapshots */
  snapshots: EmotionSnapshot[];

  /** Current trajectory */
  trajectory: EmotionalTrajectory;

  /** Identified turning points */
  turningPoints: TurningPoint[];

  /** Trajectory prediction */
  prediction: TrajectoryPrediction;

  /** Whether intervention is needed */
  interventionNeeded: boolean;

  /** Suggested intervention if needed */
  suggestedIntervention?: InterventionGuidance;
}

// ============================================================================
// ENGINE INTERFACE
// ============================================================================

/**
 * Interface for Emotional Momentum Tracker
 */
export interface IEmotionalMomentumTracker {
  /**
   * Record emotional state for a turn
   *
   * @param sessionId - Session identifier
   * @param snapshot - Emotion snapshot (without timestamp)
   */
  recordTurn(sessionId: string, snapshot: Omit<EmotionSnapshot, 'timestamp'>): void;

  /**
   * Get current momentum state
   *
   * @param sessionId - Session identifier
   * @returns Momentum state or null if not found
   */
  getMomentum(sessionId: string): EmotionalMomentum | null;

  /**
   * Check if intervention is needed
   *
   * @param sessionId - Session identifier
   * @returns Intervention guidance or null
   */
  checkIntervention(sessionId: string): InterventionGuidance | null;

  /**
   * Get topics that improved mood (safe topics)
   *
   * @param sessionId - Session identifier
   * @returns Array of safe topic names
   */
  getSafeTopics(sessionId: string): string[];

  /**
   * Get topics that declined mood (risky topics)
   *
   * @param sessionId - Session identifier
   * @returns Array of risky topic names
   */
  getRiskyTopics(sessionId: string): string[];

  /**
   * Get current trajectory
   *
   * @param sessionId - Session identifier
   * @returns Current trajectory or 'unknown'
   */
  getTrajectory(sessionId: string): EmotionalTrajectory;

  /**
   * Reset for new session
   *
   * @param sessionId - Session identifier to reset
   */
  reset(sessionId: string): void;

  /**
   * Clean up old sessions (memory management)
   */
  cleanup(): void;
}

// ============================================================================
// DI TOKEN
// ============================================================================

/**
 * DI token for Emotional Momentum Tracker
 */
export const EmotionalMomentumToken = Symbol('EmotionalMomentumTracker');
