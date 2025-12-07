/**
 * Task System Constants
 *
 * Centralized configuration for task triggers, thresholds, and priorities.
 * Extracted to enable easier tuning and testing.
 */

// ============================================================================
// DISTRESS THRESHOLDS
// ============================================================================

/**
 * Distress level thresholds for triggering different task behaviors.
 * Scale: 0.0 (calm) to 1.0 (extreme distress)
 */
export const DISTRESS_THRESHOLDS = {
  /** Minimal distress - user is slightly uncomfortable */
  MINIMAL: 0.3,
  /** Low distress - noticeable discomfort, worth monitoring */
  LOW: 0.4,
  /** Moderate distress - should consider support */
  MODERATE: 0.5,
  /** High distress - emotional support recommended */
  HIGH: 0.6,
  /** Critical distress - immediate emotional support required */
  CRITICAL: 0.7,
} as const;

/**
 * Emotion improvement threshold - how much distress must decrease
 * before considering it "improved"
 */
export const DISTRESS_IMPROVEMENT_THRESHOLD = 0.2;

// ============================================================================
// TASK PRIORITIES
// ============================================================================

/**
 * Task priority levels (1-10 scale, higher = more important)
 */
export const TASK_PRIORITIES = {
  /** Background monitoring tasks */
  BACKGROUND: 1,
  /** General advice and guidance */
  ADVICE: 5,
  /** Check-ins and follow-ups */
  CHECK_IN: 6,
  /** Milestone celebrations */
  MILESTONE: 7,
  /** Quick acknowledgments and validations */
  QUICK_RESPONSE: 8,
  /** Returning user follow-up */
  FOLLOW_UP: 8,
  /** Quick celebrations */
  QUICK_CELEBRATE: 8,
  /** Life change support */
  LIFE_CHANGE: 9,
  /** Quick acknowledgment (highest of micro) */
  QUICK_ACKNOWLEDGE: 9,
  /** Crisis and panic situations */
  CRISIS: 10,
  /** Emotional support (highest priority) */
  EMOTIONAL_SUPPORT: 10,
} as const;

// ============================================================================
// TIMING CONSTANTS
// ============================================================================

/**
 * Default turn counts for task completion
 */
export const TASK_TURN_COUNTS = {
  /** Single-turn micro tasks */
  MICRO: 1,
  /** Brief exchanges */
  SHORT: 2,
  /** Standard conversations */
  STANDARD: 3,
  /** Deeper discussions */
  EXTENDED: 4,
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type DistressLevel = keyof typeof DISTRESS_THRESHOLDS;
export type TaskPriority = keyof typeof TASK_PRIORITIES;
