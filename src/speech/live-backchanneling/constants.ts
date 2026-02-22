/**
 * Live Backchanneling Constants
 *
 * Configuration and phrase banks for live backchanneling during user speech.
 *
 * IMPORTANT: Live backchannels are MINIMAL presence signals during user speech.
 * They're NOT meant to be substantial acknowledgments - the LLM handles those
 * in turn responses based on behavioral guidance from dynamic-speech-guidance.ts.
 *
 * Live backchannels should be:
 * - RARE: Low probability, long intervals
 * - SHORT: 1-2 syllables max ("Mm", "Yeah")
 * - SOFT: 30% volume, quick
 * - CONTEXT-AWARE: Only during natural breath pauses
 *
 * For substantial acknowledgments, the LLM generates contextually appropriate
 * responses based on what the user actually said.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

export const CONFIG = {
  /** Minimum time into turn before live backchannel (ms) */
  MIN_SPEAKING_DURATION: 6000, // Increased from 5000 - wait 6s before backchanneling

  /**
   * Minimum time between backchannels (ms)
   * TIMING FIX (Jan 2026): Increased to 15s to match timing-config.ts
   * Target: ~3-4 backchannels per minute (human parity)
   */
  MIN_INTERVAL: 15000, // Increased from 10000 - 15s between backchannels

  /** Volume ratio for soft backchannels (30% of normal) */
  SOFT_VOLUME_RATIO: 0.3,

  /** Breath pause detection window (ms) - pauses shorter than this are breath pauses */
  BREATH_PAUSE_MAX: 400,

  /** Minimum turns before live backchannels start */
  MIN_TURNS: 5, // Increased from 4 - wait for more rapport before backchanneling

  /**
   * Probability of backchannel when conditions are met - LOW to minimize repetition
   * TIMING FIX (Jan 2026): Reduced to 10% to fix "all over the place" feel
   */
  BASE_PROBABILITY: 0.1, // Reduced from 0.15 - less frequent

  /**
   * Increased probability for emotional moments - still very conservative
   * TIMING FIX (Jan 2026): Reduced to 20%
   */
  EMOTIONAL_PROBABILITY: 0.2, // Reduced from 0.3
} as const;

// ============================================================================
// SOFT BACKCHANNEL PHRASES
// ============================================================================

/**
 * Ultra-short phrases that work well as soft overlays
 * These are different from regular backchannels - they're shorter and softer
 */
export const SOFT_BACKCHANNELS: Record<string, Record<string, string[]>> = {
  ferni: {
    neutral: ['Mm', 'Yeah', 'Mhm', 'Right'],
    empathetic: ['Mm', 'Yeah', 'I hear you'],
    engaged: ['Oh', 'Mm', 'Yeah'],
  },
  'jordan-taylor': {
    neutral: ['Yeah', 'Mhm', 'Uh-huh'],
    empathetic: ['Mm', 'Yeah', 'Oh'],
    engaged: ['Oh!', 'Yeah!', 'Mhm!'],
  },
  'nayan-patel': {
    neutral: ['Mm', 'Yes', 'Indeed'],
    empathetic: ['Mm', 'Yes', 'I see'],
    engaged: ['Mm', 'Yes', 'Ah'],
  },
  'alex-chen': {
    neutral: ['Mm', 'Yeah', 'Got it'],
    empathetic: ['Mm', 'Yeah', 'I see'],
    engaged: ['Right', 'Yeah', 'Okay'],
  },
  'maya-santos': {
    // HUMANIZATION FIX (Dec 2025): More variety to prevent robotic repetition
    // Maya is warm and supportive - her backchannels should reflect that
    neutral: ['Mm', 'Yeah', 'Mhm', 'Okay', 'Mm-hm', 'Yep', 'Uh-huh'],
    empathetic: ['Mm', 'Yeah', 'I hear you', 'Mmm', 'Ahh', 'Yeah...', 'Mm-hm'],
    engaged: ['Oh', 'Yeah', 'Right', 'Mm!', 'Ah', 'Oh!', 'Yes'],
  },
  'peter-john': {
    neutral: ['Mm', 'Yeah', 'Okay'],
    empathetic: ['Mm', 'Yeah', 'Right'],
    engaged: ['Oh!', 'Yeah!', 'Interesting'],
  },
};

// ============================================================================
// BREATH PAUSE DETECTION CONFIG
// ============================================================================

/**
 * Configuration for audio-based breath pause detection
 */
export const BREATH_PAUSE_CONFIG = {
  /** RMS energy threshold below which we consider silence (0-1 scale) */
  SILENCE_THRESHOLD: 0.02,

  /** Minimum energy to consider "speech" vs ambient noise */
  SPEECH_THRESHOLD: 0.05,

  /** Number of consecutive low-energy frames to confirm pause */
  PAUSE_CONFIRMATION_FRAMES: 3,

  /** Number of consecutive high-energy frames to confirm speech */
  SPEECH_CONFIRMATION_FRAMES: 2,

  /** Smoothing factor for energy (0-1, higher = more smoothing) */
  ENERGY_SMOOTHING: 0.7,

  /** Minimum speaking time before detecting pauses (ms) */
  MIN_SPEAKING_TIME: 1000,

  /** History size for pause duration tracking */
  PAUSE_HISTORY_SIZE: 20,
} as const;

// ============================================================================
// EXTENDED PAUSE & MICRO-REACTION CONFIG
// ============================================================================

/** Extended pauses (800-1500ms) — moments for subtle verbal acknowledgments */
export const EXTENDED_PAUSE_MIN_MS = 800;
export const EXTENDED_PAUSE_MAX_MS = 1500;

/** Don't react too often — minimum ms between micro-reactions */
export const MICRO_REACTION_COOLDOWN_MS = 8000;

/**
 * Softer than regular backchannels — for extended pauses during user speech.
 * Keys match SOFT_BACKCHANNELS persona IDs.
 */
export const MICRO_REACTION_PHRASES: Record<string, string[]> = {
  ferni: ['Mm', 'Hmm', 'Mm-hmm'],
  'peter-john': ['Mm', 'Hmm', 'I see'],
  'maya-santos': ['Mm', 'Hmm', 'Mhm'],
  'alex-chen': ['Mm', 'Hmm', 'Right'],
  'jordan-taylor': ['Mm', 'Hmm', 'Okay'],
  'nayan-patel': ['Mm', 'Hmm', 'Ah'],
};
