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
  /** Severe distress - crisis-level intervention needed */
  SEVERE: 0.8,
} as const;

/**
 * Emotion improvement threshold - how much distress must decrease
 * before considering it "improved"
 */
export const DISTRESS_IMPROVEMENT_THRESHOLD = 0.2;

/** Default emotion threshold for IntelligentTask support mode */
export const DEFAULT_EMOTION_THRESHOLD = 0.5;

/** More sensitive threshold for support-focused tasks */
export const SENSITIVE_EMOTION_THRESHOLD = 0.4;

/** Very sensitive threshold for crisis detection */
export const CRISIS_EMOTION_THRESHOLD = 0.3;

// ============================================================================
// TASK PRIORITIES
// ============================================================================

/**
 * Task priority levels (1-10 scale, higher = more important)
 */
export const TASK_PRIORITIES = {
  /** Background monitoring tasks */
  BACKGROUND: 1,
  /** Domain-specific educational content */
  DOMAIN_EDUCATION: 4,
  /** General advice and guidance */
  ADVICE: 5,
  /** Wisdom sharing */
  WISDOM: 5,
  /** Check-ins and follow-ups */
  CHECK_IN: 6,
  /** Goodbye and wrap-up */
  GOODBYE: 6,
  /** Fear addressing */
  FEAR_ADDRESSING: 7,
  /** Milestone celebrations */
  MILESTONE: 7,
  /** Quick acknowledgments and validations */
  QUICK_RESPONSE: 8,
  /** Returning user follow-up */
  FOLLOW_UP: 8,
  /** Quick celebrations */
  QUICK_CELEBRATE: 8,
  /** Quick validation */
  QUICK_VALIDATE: 8,
  /** Life change support */
  LIFE_CHANGE: 9,
  /** Quick acknowledgment (highest of micro) */
  QUICK_ACKNOWLEDGE: 9,
  /** Grief support */
  GRIEF: 10,
  /** Panic prevention */
  PANIC: 10,
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
  /** Long-form guidance */
  LONG: 5,
} as const;

// ============================================================================
// EMOTION AND INTENT CONSTANTS
// ============================================================================

/** Primary emotions that tasks can respond to */
export const EMOTIONS = {
  SADNESS: 'sadness',
  FEAR: 'fear',
  ANGER: 'anger',
  JOY: 'joy',
  EXCITEMENT: 'excitement',
  PRIDE: 'pride',
  ANXIETY: 'anxiety',
  ANTICIPATION: 'anticipation',
  NEUTRAL: 'neutral',
} as const;

/** Emotion valence categories */
export const VALENCE = {
  POSITIVE: 'positive',
  NEGATIVE: 'negative',
  NEUTRAL: 'neutral',
} as const;

/** User intents that tasks can respond to */
export const INTENTS = {
  SEEKING_ADVICE: 'seeking_advice',
  ASKING_QUESTION: 'asking_question',
  REQUESTING_INFO: 'requesting_info',
  CONFIDING: 'confiding',
  VENTING: 'venting',
  SHARING_NEWS: 'sharing_news',
  GREETING: 'greeting',
  ENDING_CONVERSATION: 'ending_conversation',
  SMALL_TALK: 'small_talk',
} as const;

/** Conversation phases for contextual task triggering */
export const CONVERSATION_PHASES = {
  OPENING: 'opening',
  EXPLORING: 'exploring',
  DEEPENING: 'deepening',
  ADVISING: 'advising',
  SUPPORTING: 'supporting',
  CLOSING: 'closing',
} as const;

// ============================================================================
// KEYWORD PATTERNS
// ============================================================================

/** Common keyword patterns for task triggering */
export const KEYWORD_PATTERNS = {
  PANIC: /\b(panic|freaking out|losing it|can't handle|too much|overwhelmed)\b/i,
  GRIEF: /\b(passed away|died|lost my|funeral|grieving|mourning)\b/i,
  LIFE_CHANGE: /\b(lost my job|got fired|laid off|divorced|new baby|retiring)\b/i,
  MILESTONE: /\b(paid off|debt free|reached|hit|milestone|goal|saved|finally)\b/i,
  VALIDATION: /\b(am i crazy|is it wrong|should i feel|normal to)\b/i,
  FEAR: /\b(afraid|scared|worried|nervous|concerned|fear|what if)\b/i,
  GOODBYE: /\b(goodbye|bye|gotta go|have to go|talk later)\b/i,
} as const;

// ============================================================================
// METRICS THRESHOLDS
// ============================================================================

/** Thresholds for task effectiveness metrics */
export const METRICS_THRESHOLDS = {
  EFFECTIVE_DISTRESS_IMPROVEMENT: 0.1,
  MAX_REASONABLE_TURNS: 10,
  MIN_EFFECTIVENESS_RATING: 3,
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type DistressLevel = keyof typeof DISTRESS_THRESHOLDS;
export type TaskPriority = keyof typeof TASK_PRIORITIES;
export type TaskTurnCount = keyof typeof TASK_TURN_COUNTS;
export type EmotionType = (typeof EMOTIONS)[keyof typeof EMOTIONS];
export type ValenceType = (typeof VALENCE)[keyof typeof VALENCE];
export type IntentType = (typeof INTENTS)[keyof typeof INTENTS];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Check if a distress level exceeds a threshold */
export function exceedsDistressThreshold(distressLevel: number, threshold: DistressLevel): boolean {
  return distressLevel > DISTRESS_THRESHOLDS[threshold];
}

// ============================================================================
// DISTRESS DETECTION UTILITIES
// ============================================================================

/**
 * Emotion analysis input for distress detection
 */
export interface EmotionAnalysis {
  primary: string;
  valence: 'positive' | 'negative' | 'neutral';
  intensity: number;
  distressLevel: number;
}

/**
 * Result of distress assessment
 */
export interface DistressAssessment {
  /** Current distress level (0-1) */
  level: number;
  /** Categorized severity */
  severity: 'none' | 'minimal' | 'low' | 'moderate' | 'high' | 'critical' | 'severe';
  /** Whether immediate support is needed */
  needsImmediateSupport: boolean;
  /** Whether support mode should be activated */
  shouldActivateSupportMode: boolean;
  /** Suggested response approach */
  suggestedApproach: 'normal' | 'gentle' | 'supportive' | 'crisis';
}

/**
 * Unified distress detection used by both TaskManager and IntelligentTaskGroup.
 * This ensures consistent distress handling across the entire task system.
 *
 * @param emotion - Emotion analysis from conversation
 * @param sensitivityLevel - How sensitive to be (default: 'normal')
 * @returns Comprehensive distress assessment
 */
export function assessDistress(
  emotion: EmotionAnalysis,
  sensitivityLevel: 'normal' | 'sensitive' | 'crisis' = 'normal'
): DistressAssessment {
  const { distressLevel, primary, valence } = emotion;

  // Determine threshold based on sensitivity
  const thresholdOffset =
    sensitivityLevel === 'crisis' ? -0.2 : sensitivityLevel === 'sensitive' ? -0.1 : 0;

  // Categorize severity
  let severity: DistressAssessment['severity'];
  if (distressLevel < DISTRESS_THRESHOLDS.MINIMAL + thresholdOffset) {
    severity = 'none';
  } else if (distressLevel < DISTRESS_THRESHOLDS.LOW + thresholdOffset) {
    severity = 'minimal';
  } else if (distressLevel < DISTRESS_THRESHOLDS.MODERATE + thresholdOffset) {
    severity = 'low';
  } else if (distressLevel < DISTRESS_THRESHOLDS.HIGH + thresholdOffset) {
    severity = 'moderate';
  } else if (distressLevel < DISTRESS_THRESHOLDS.CRITICAL + thresholdOffset) {
    severity = 'high';
  } else if (distressLevel < DISTRESS_THRESHOLDS.SEVERE + thresholdOffset) {
    severity = 'critical';
  } else {
    severity = 'severe';
  }

  // Determine if immediate support is needed
  const needsImmediateSupport =
    severity === 'critical' ||
    severity === 'severe' ||
    (severity === 'high' && (primary === 'fear' || primary === 'sadness'));

  // Determine if support mode should be activated
  const supportModeThreshold =
    sensitivityLevel === 'crisis'
      ? CRISIS_EMOTION_THRESHOLD
      : sensitivityLevel === 'sensitive'
        ? SENSITIVE_EMOTION_THRESHOLD
        : DEFAULT_EMOTION_THRESHOLD;

  const shouldActivateSupportMode = distressLevel > supportModeThreshold;

  // Suggest response approach
  let suggestedApproach: DistressAssessment['suggestedApproach'];
  if (severity === 'severe' || severity === 'critical') {
    suggestedApproach = 'crisis';
  } else if (severity === 'high' || severity === 'moderate') {
    suggestedApproach = 'supportive';
  } else if (severity === 'low' || severity === 'minimal') {
    suggestedApproach = 'gentle';
  } else {
    suggestedApproach = 'normal';
  }

  return {
    level: distressLevel,
    severity,
    needsImmediateSupport,
    shouldActivateSupportMode,
    suggestedApproach,
  };
}

/**
 * Check if distress has improved enough to consider a support task complete
 */
export function hasDistressImproved(
  initialDistress: number,
  currentDistress: number,
  threshold: number = DISTRESS_IMPROVEMENT_THRESHOLD
): boolean {
  return initialDistress - currentDistress >= threshold;
}

/**
 * Get the appropriate emotion threshold for a task type
 */
export function getEmotionThresholdForTask(
  taskCategory: 'micro' | 'support' | 'advice' | 'relationship' | 'life_event'
): number {
  switch (taskCategory) {
    case 'support':
      return SENSITIVE_EMOTION_THRESHOLD;
    case 'life_event':
      return SENSITIVE_EMOTION_THRESHOLD;
    case 'micro':
      return DEFAULT_EMOTION_THRESHOLD;
    case 'advice':
      return DEFAULT_EMOTION_THRESHOLD;
    case 'relationship':
      return DEFAULT_EMOTION_THRESHOLD;
    default:
      return DEFAULT_EMOTION_THRESHOLD;
  }
}

/**
 * Determine if a task should be skipped due to user distress
 */
export function shouldSkipTaskDueToDistress(
  distressLevel: number,
  taskPriority: number,
  skipIfDistressed = false
): boolean {
  // If task explicitly skips during distress
  if (skipIfDistressed && distressLevel > DISTRESS_THRESHOLDS.MODERATE) {
    return true;
  }

  // High priority tasks (8+) never skip
  if (taskPriority >= 8) {
    return false;
  }

  // Medium priority tasks (5-7) skip at high distress
  if (taskPriority >= 5 && distressLevel > DISTRESS_THRESHOLDS.HIGH) {
    return true;
  }

  // Low priority tasks (1-4) skip at moderate distress
  if (taskPriority < 5 && distressLevel > DISTRESS_THRESHOLDS.MODERATE) {
    return true;
  }

  return false;
}
