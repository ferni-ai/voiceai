/**
 * Intelligence Module Constants
 *
 * Central configuration for all intelligence-related magic numbers.
 * Improves maintainability and makes tuning easier.
 */

// =============================================================================
// CONVERSATION ANALYSIS
// =============================================================================

export const CONVERSATION = {
  /** Minimum turns before learning preferences */
  MIN_TURNS_FOR_PREFERENCE_LEARNING: 5,

  /** How many emotions to keep in history */
  EMOTION_HISTORY_SIZE: 20,

  /** Maximum conversation history items to track */
  MAX_CONVERSATION_HISTORY: 100,

  /** Turns between preference capture attempts */
  TURNS_BETWEEN_PREFERENCE_CAPTURE: 5,
} as const;

// =============================================================================
// EMOTION DETECTION
// =============================================================================

export const EMOTION = {
  /** Confidence threshold for LLM enhancement */
  LLM_ENHANCEMENT_THRESHOLD: 0.5,

  /** High confidence threshold (skip LLM) */
  HIGH_CONFIDENCE_THRESHOLD: 0.7,

  /** Distress level requiring emotional support */
  DISTRESS_SUPPORT_THRESHOLD: 0.4,

  /** High distress requiring gentle response */
  HIGH_DISTRESS_THRESHOLD: 0.6,

  /** Very high distress (crisis mode) */
  CRISIS_DISTRESS_THRESHOLD: 0.8,

  /** Intensity threshold for tracking emotions */
  INTENSITY_TRACKING_THRESHOLD: 0.5,
} as const;

// =============================================================================
// COMMUNITY LEARNING
// =============================================================================

export const COMMUNITY = {
  /** Minimum samples before pattern is considered reliable */
  MIN_SAMPLES_FOR_PATTERN: 10,

  /** Samples needed for high confidence */
  HIGH_CONFIDENCE_SAMPLES: 50,

  /** How often to recompute patterns (every N signals) */
  RECOMPUTE_PATTERN_INTERVAL: 100,

  /** Maximum response signals to keep */
  MAX_RESPONSE_SIGNALS: 10000,
} as const;

// =============================================================================
// PROACTIVE INSIGHTS
// =============================================================================

export const PROACTIVE = {
  /** Maximum insights to store per user */
  MAX_INSIGHTS_PER_USER: 50,

  /** Days until overdue check-in (default) */
  DEFAULT_OVERDUE_DAYS: 14,

  /** Maximum overdue days (high priority) */
  HIGH_PRIORITY_OVERDUE_DAYS: 30,

  /** Days before goal deadline for reminder */
  GOAL_REMINDER_DAYS: 90,

  /** Days for high-priority goal reminder */
  GOAL_HIGH_PRIORITY_DAYS: 30,

  /** Days for stalled goal check-in */
  GOAL_STALLED_DAYS: 30,

  /** Relationship milestone months to celebrate */
  RELATIONSHIP_MILESTONES: [6, 12, 24, 36, 48, 60],
} as const;

// =============================================================================
// CROSS-SESSION THREADING
// =============================================================================

export const THREADING = {
  /** Maximum open threads to keep */
  MAX_OPEN_THREADS: 20,

  /** Maximum promised follow-ups to track */
  MAX_FOLLOW_UPS: 20,

  /** Short conversation threshold (minutes) */
  SHORT_CONVERSATION_MINUTES: 5,
} as const;

// =============================================================================
// USER LEARNING
// =============================================================================

export const LEARNING = {
  /** Maximum key moments to store */
  MAX_KEY_MOMENTS: 50,

  /** Maximum emotional patterns to store */
  MAX_EMOTIONAL_PATTERNS: 50,

  /** Maximum shared stories to track */
  MAX_SHARED_STORIES: 50,

  /** Days to consider moment recent */
  RECENT_MOMENT_DAYS: 30,

  /** Days to consider profile moment recent */
  PROFILE_MOMENT_DAYS: 30,

  /** Voice emotion validation window (ms) */
  VOICE_EMOTION_VALIDATION_WINDOW_MS: 30000,

  /** Voice emotion accuracy sample size */
  VOICE_EMOTION_SAMPLE_SIZE: 20,
} as const;

// =============================================================================
// A/B TESTING & EVOLUTION
// =============================================================================

export const EVOLUTION = {
  /** Minimum confidence to auto-enable adjustment */
  AUTO_ENABLE_CONFIDENCE: 0.7,

  /** Z-score threshold for experiment conclusion */
  EXPERIMENT_Z_SCORE_THRESHOLD: 1.96,

  /** Minimum samples for emergent pattern detection */
  EMERGENT_PATTERN_MIN_SAMPLES: 10,

  /** Positive rate threshold above baseline for emergent detection */
  EMERGENT_POSITIVE_RATE_THRESHOLD: 0.15,
} as const;

// =============================================================================
// CACHE SIZES (for LRU caches)
// =============================================================================

export const CACHE = {
  /** User-scoped engines (ProactiveInsight, CrossSessionThreader, etc.) */
  USER_ENGINES: 500,

  /** Response quality trackers per user */
  RESPONSE_TRACKERS: 500,

  /** Conversation pattern analyzers per user */
  PATTERN_ANALYZERS: 500,

  /** Voice pace adapters per user */
  PACE_ADAPTERS: 500,

  /** Humor calibration per user */
  HUMOR_CALIBRATION: 500,

  /** Story preference per user */
  STORY_PREFERENCE: 500,

  /** Communication mirroring per user */
  COMMUNICATION_MIRRORING: 500,

  /** Emotional memory per user */
  EMOTIONAL_MEMORY: 500,

  /** Financial journey trackers per user */
  FINANCIAL_JOURNEY: 500,
} as const;

// =============================================================================
// PERSISTENCE
// =============================================================================

export const PERSISTENCE = {
  /** Cooldown between Firestore loads (ms) */
  FIRESTORE_LOAD_COOLDOWN_MS: 60000,
} as const;

// =============================================================================
// EXPORT ALL
// =============================================================================

export const INTELLIGENCE_CONSTANTS = {
  CONVERSATION,
  EMOTION,
  COMMUNITY,
  PROACTIVE,
  THREADING,
  LEARNING,
  EVOLUTION,
  CACHE,
  PERSISTENCE,
} as const;

export default INTELLIGENCE_CONSTANTS;

