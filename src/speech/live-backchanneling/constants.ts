/**
 * Live Backchanneling Constants
 *
 * Configuration and phrase banks for live backchanneling.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

export const CONFIG = {
  /** Minimum time into turn before live backchannel (ms) */
  MIN_SPEAKING_DURATION: 4000,

  /** Minimum time between backchannels (ms) */
  MIN_INTERVAL: 8000,

  /** Volume ratio for soft backchannels (30% of normal) */
  SOFT_VOLUME_RATIO: 0.3,

  /** Breath pause detection window (ms) - pauses shorter than this are breath pauses */
  BREATH_PAUSE_MAX: 400,

  /** Minimum turns before live backchannels start */
  MIN_TURNS: 3,

  /** Probability of backchannel when conditions are met */
  BASE_PROBABILITY: 0.25,

  /** Increased probability for emotional moments */
  EMOTIONAL_PROBABILITY: 0.4,
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
    neutral: ['Mm', 'Yeah', 'Okay'],
    empathetic: ['Mm', 'Yeah', 'I hear you'],
    engaged: ['Oh', 'Yeah', 'Right'],
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
