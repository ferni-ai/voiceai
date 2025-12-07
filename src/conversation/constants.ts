/**
 * Conversation Module Constants
 *
 * Centralized constants to avoid magic strings and numbers scattered throughout.
 */

// ============================================================================
// PERSONA IDS
// ============================================================================

/**
 * Canonical persona IDs used throughout the conversation module.
 * Use these constants instead of hardcoding strings.
 */
export const PERSONA_IDS = {
  FERNI: 'ferni',
  NAYAN_PATEL: 'nayan-patel',
  PETER_JOHN: 'peter-john',
  MAYA_SANTOS: 'maya-santos',
  ALEX_CHEN: 'alex-chen',
  JORDAN_TAYLOR: 'jordan-taylor',
} as const;

export type PersonaId = (typeof PERSONA_IDS)[keyof typeof PERSONA_IDS];

// ============================================================================
// COMMON STOP WORDS
// ============================================================================

/**
 * Common English stop words for text processing.
 * Pre-computed Set for O(1) lookups.
 */
export const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'shall',
  'can',
  'need',
  'dare',
  'ought',
  'used',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  'me',
  'him',
  'her',
  'us',
  'them',
  'my',
  'your',
  'his',
  'its',
  'our',
  'their',
  'mine',
  'yours',
  'hers',
  'ours',
  'theirs',
  'this',
  'that',
  'these',
  'those',
  'what',
  'which',
  'who',
  'whom',
  'whose',
  'and',
  'but',
  'or',
  'nor',
  'so',
  'yet',
  'both',
  'either',
  'neither',
  'not',
  'no',
  'yes',
  'just',
  'also',
  'very',
  'too',
  'quite',
  'rather',
  'about',
  'like',
  'really',
  'think',
  'know',
  'get',
  'got',
  'want',
  'going',
  'because',
  'when',
  'if',
  'then',
  'than',
  'some',
  'any',
  'all',
  'each',
]);

// ============================================================================
// VOCABULARY MIRRORING PATTERNS
// ============================================================================

/**
 * Pre-compiled regex patterns for vocabulary mirroring.
 * Maps base words to their synonyms and pre-compiled regex.
 */
export interface VocabularyPattern {
  synonyms: string[];
  pattern: RegExp;
}

export const VOCABULARY_PATTERNS: Record<string, VocabularyPattern> = {
  worried: {
    synonyms: ['concerned', 'anxious', 'uneasy'],
    pattern: /\b(worried|concerned|anxious|uneasy)\b/gi,
  },
  scared: {
    synonyms: ['afraid', 'fearful', 'nervous'],
    pattern: /\b(scared|afraid|fearful|nervous)\b/gi,
  },
  excited: {
    synonyms: ['thrilled', 'eager', 'enthusiastic'],
    pattern: /\b(excited|thrilled|eager|enthusiastic)\b/gi,
  },
  happy: {
    synonyms: ['glad', 'pleased', 'satisfied'],
    pattern: /\b(happy|glad|pleased|satisfied)\b/gi,
  },
  money: {
    synonyms: ['finances', 'funds', 'cash'],
    pattern: /\b(money|finances|funds|cash)\b/gi,
  },
  plan: {
    synonyms: ['strategy', 'approach', 'method'],
    pattern: /\b(plan|strategy|approach|method)\b/gi,
  },
  goal: {
    synonyms: ['objective', 'target', 'aim'],
    pattern: /\b(goal|objective|target|aim)\b/gi,
  },
};

// ============================================================================
// DEFAULT SESSION ID
// ============================================================================

/**
 * Default session ID for backward compatibility.
 * New code should always provide an explicit session ID.
 */
export const DEFAULT_SESSION_ID = '_default';

// ============================================================================
// SILENCE THRESHOLDS (exported for testing/overrides)
// ============================================================================

export const SILENCE_THRESHOLDS = {
  /** Silence duration before considering a backchannel (ms) */
  BACKCHANNEL: 3500,
  /** Silence duration before considering a gentle prompt (ms) */
  GENTLE_PROMPT: 5000,
  /** Silence duration after personal sharing before responding (ms) */
  PERSONAL_SHARING: 5000,
  /** Silence duration during high emotion before responding (ms) */
  HIGH_EMOTION: 6000,
  /** Normal conversational pause threshold (ms) */
  NORMAL_PAUSE: 2500,
  /** Extended pause threshold (ms) */
  EXTENDED_PAUSE: 4000,
} as const;

// ============================================================================
// MESSAGE THRESHOLDS
// ============================================================================

export const MESSAGE_THRESHOLDS = {
  /** Minimum message length to trigger backchannel consideration */
  BACKCHANNEL_MIN_LENGTH: 100,
  /** Minimum word count for a "detailed" response */
  DETAILED_RESPONSE_WORDS: 50,
  /** Maximum word count for a "short" response */
  SHORT_RESPONSE_WORDS: 10,
  /** Minimum turns before memory callback is considered */
  MIN_TURNS_FOR_CALLBACK: 4,
  /** Minimum turns for deep reflective questions */
  DEEP_REFLECTION_THRESHOLD: 8,
  /** Medium conversation depth threshold */
  MEDIUM_DEPTH_THRESHOLD: 4,
} as const;

// ============================================================================
// PROBABILITY DEFAULTS
// ============================================================================

/**
 * Default probabilities for various humanization features.
 * These should be used as fallbacks when config is not available.
 */
export const DEFAULT_PROBABILITIES = {
  /** Probability of backchannel when conditions are met */
  BACKCHANNEL: 0.3,
  /** Probability of memory callback when conditions are met */
  MEMORY_CALLBACK: 0.2,
  /** Probability of follow-up question */
  FOLLOW_UP_QUESTION: 0.35,
  /** Probability of adding question suggestion guidance */
  QUESTION_SUGGESTION: 0.4,
  /** Probability of using persona-specific phrase */
  PERSONA_PHRASE: 0.2,
  /** Probability of adding uncertainty hedge */
  UNCERTAINTY_HEDGE: 0.1,
} as const;
