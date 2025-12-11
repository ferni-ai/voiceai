/**
 * Voice Humanization Constants
 *
 * Static data and thresholds for voice humanization.
 */

// ============================================================================
// MICRO-INTERRUPTION WORDS
// ============================================================================

/**
 * Words that should immediately stop agent speech when detected
 * These are common human interruption patterns
 */
export const IMMEDIATE_STOP_WORDS = new Set([
  'wait',
  'hold on',
  'stop',
  'actually',
  'hang on',
  'one sec',
  'one second',
  'pause',
  'wait wait',
  'hold up',
]);

/**
 * Words that suggest user wants to interject soon (but not immediately)
 */
export const SOFT_INTERRUPTION_WORDS = new Set([
  'but',
  'no',
  'um',
  'uh',
  'well',
  'hmm',
  "i don't",
  "that's not",
  'sorry',
]);

/**
 * Quick acknowledgment phrases that often precede interruptions
 */
export const PRE_INTERRUPTION_PATTERNS = [
  /^(yeah|yes|right|okay|ok|sure|uh huh|mm hmm|mhm)\s+(but|actually|wait|no)/i,
  /^(no|nope|nah)\s*(,|that's|i|but|wait)/i,
];

// ============================================================================
// LAUGHTER DETECTION THRESHOLDS
// ============================================================================

/**
 * Audio characteristics that suggest laughter
 * Based on energy bursts, pitch variation, and timing patterns
 */
export const LAUGHTER_THRESHOLDS = {
  /** Minimum energy peaks per second to suggest laughter */
  MIN_ENERGY_PEAKS_PER_SEC: 3,
  /** Maximum utterance duration for laughter (ms) */
  MAX_LAUGHTER_DURATION_MS: 3000,
  /** Minimum pitch variance for laughter */
  MIN_PITCH_VARIANCE: 30,
  /** High energy with short duration = likely laughter */
  ENERGY_DURATION_RATIO: 0.5,
} as const;

// ============================================================================
// PERSONA-SPECIFIC LAUGHTER RESPONSES
// ============================================================================

/**
 * SSML responses for detected laughter, by persona
 */
export const LAUGHTER_RESPONSES: Record<string, Record<string, string[]>> = {
  ferni: {
    join_in: ['<break time="100ms"/>Ha! <break time="50ms"/>'],
    acknowledge: ['<break time="150ms"/>Heh, yeah.<break time="100ms"/>'],
    smile: ['<break time="100ms"/>'],
  },
  'peter-john': {
    join_in: ['Ha! <break time="50ms"/>'],
    acknowledge: ['Yeah, exactly! <break time="50ms"/>'],
    smile: [''],
  },
  'maya-santos': {
    join_in: ['<break time="100ms"/>Haha! <break time="50ms"/>'],
    acknowledge: ['<break time="150ms"/>I know, right? <break time="50ms"/>'],
    smile: ['<break time="100ms"/>'],
  },
  default: {
    join_in: ['<break time="100ms"/>Ha! <break time="50ms"/>'],
    acknowledge: ['<break time="150ms"/>'],
    smile: [''],
  },
};
