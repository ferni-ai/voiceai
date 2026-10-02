/**
 * Emotional Contagion Types
 *
 * Shapes for emotional momentum and prosodic continuity across utterances,
 * shared by the context manager's speech insights. The per-reply service that
 * turned these into SSML ran only in the removed post-LLM response processor;
 * how a live reply sounds is decided once per reply by the TTS path.
 *
 * @module EmotionalContagion
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Emotional state for a single utterance
 */
export interface UtteranceEmotionalState {
  /** Timestamp when utterance was generated */
  timestamp: number;
  /** Primary emotion expressed */
  emotion: string;
  /** Valence (-1 to 1) */
  valence: number;
  /** Arousal/energy (0 to 1) */
  arousal: number;
  /** Warmth level */
  warmth: 'high' | 'medium' | 'low';
  /** Was this a response to user distress? */
  wasSupporting: boolean;
}

/**
 * Emotional momentum tracking
 */
export interface EmotionalMomentum {
  /** Current momentum valence (smoothed) */
  valence: number;
  /** Current momentum arousal (smoothed) */
  arousal: number;
  /** Current warmth level */
  warmth: 'high' | 'medium' | 'low';
  /** How many turns at current emotional state */
  turnsAtState: number;
  /** Is momentum building or dissipating? */
  trend: 'building' | 'stable' | 'dissipating';
}

/**
 * SSML continuity hints for TTS
 */
export interface ProsodyContinuityHints {
  /** Opening modifier (affect how utterance starts) */
  opening: {
    /** Pause before speaking (ms) */
    pauseMs: number;
    /** Should start soft/quiet? */
    softStart: boolean;
    /** Should build energy? */
    buildEnergy: boolean;
  };

  /** Overall prosody adjustments */
  prosody: {
    /** Speed adjustment (-0.3 to 0.3) */
    speedAdjust: number;
    /** Volume adjustment (0.8 to 1.2) */
    volumeAdjust: number;
    /** Pitch tendency ('higher' | 'lower' | 'neutral') */
    pitchTendency: 'higher' | 'lower' | 'neutral';
  };

  /** Emotional coloring for TTS */
  emotion: {
    /** Suggested emotion tag */
    tag: string;
    /** Intensity (0-1) */
    intensity: number;
  };

  /** Whether to add closing warmth */
  closingWarmth: boolean;

  /** Reason for these hints (for debugging) */
  reason: string;
}
