/**
 * Emotional Contagion Service
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Maintains prosodic and emotional continuity across utterances.
 * Humans don't reset their voice between sentences - if they're comforting
 * someone, warmth carries through. If they're excited, energy builds.
 *
 * This service:
 * 1. Tracks emotional "momentum" across turns
 * 2. Provides SSML hints for TTS to maintain continuity
 * 3. Prevents jarring emotional resets between sentences
 * 4. Enables gradual emotional transitions
 *
 * @module EmotionalContagion
 */

import { getLogger } from '../utils/safe-logger.js';
import type { EmotionalArc } from '../conversation/emotional-arc.js';

const log = getLogger().child({ module: 'EmotionalContagion' });

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

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONTAGION_CONFIG = {
  /** How much recent utterances influence momentum (0-1) */
  MOMENTUM_DECAY: 0.3,
  /** Turns needed to establish stable state */
  STABLE_TURNS: 3,
  /** Maximum warmth duration (turns) before natural decay */
  MAX_WARMTH_TURNS: 10,
  /** Speed at which arousal normalizes */
  AROUSAL_NORMALIZATION_RATE: 0.1,
} as const;

// ============================================================================
// EMOTIONAL CONTAGION SERVICE
// ============================================================================

export class EmotionalContagionService {
  private utteranceHistory: UtteranceEmotionalState[] = [];
  private momentum: EmotionalMomentum;
  private readonly maxHistory = 10;
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.momentum = this.createInitialMomentum();
    log.debug({ sessionId }, '💫 Emotional contagion service initialized');
  }

  /**
   * Record an utterance's emotional state
   * Call this AFTER each agent utterance is generated
   */
  recordUtterance(state: Omit<UtteranceEmotionalState, 'timestamp'>): void {
    const fullState: UtteranceEmotionalState = {
      ...state,
      timestamp: Date.now(),
    };

    this.utteranceHistory.push(fullState);
    if (this.utteranceHistory.length > this.maxHistory) {
      this.utteranceHistory.shift();
    }

    // Update momentum
    this.updateMomentum(fullState);

    log.debug(
      {
        emotion: state.emotion,
        valence: state.valence.toFixed(2),
        arousal: state.arousal.toFixed(2),
        warmth: state.warmth,
        momentumTrend: this.momentum.trend,
      },
      '💫 Utterance emotional state recorded'
    );
  }

  /**
   * Get prosody hints for the NEXT utterance
   * Call this BEFORE generating TTS
   */
  getContinuityHints(
    emotionalArc: EmotionalArc | null,
    currentEmotion?: string
  ): ProsodyContinuityHints {
    const hints: ProsodyContinuityHints = {
      opening: {
        pauseMs: 100,
        softStart: false,
        buildEnergy: false,
      },
      prosody: {
        speedAdjust: 0,
        volumeAdjust: 1.0,
        pitchTendency: 'neutral',
      },
      emotion: {
        tag: 'neutral',
        intensity: 0.5,
      },
      closingWarmth: false,
      reason: 'Default neutral state',
    };

    const reasons: string[] = [];

    // Apply momentum-based adjustments
    if (this.momentum.turnsAtState >= CONTAGION_CONFIG.STABLE_TURNS) {
      // Stable emotional state - maintain it

      // High warmth should continue
      if (this.momentum.warmth === 'high') {
        hints.emotion.tag = 'warm';
        hints.emotion.intensity = 0.7;
        hints.prosody.pitchTendency = 'lower'; // Warmer voices tend lower
        hints.prosody.volumeAdjust = 0.95; // Slightly softer
        hints.closingWarmth = true;
        reasons.push('maintaining high warmth');
      }

      // High arousal should continue
      if (this.momentum.arousal > 0.6) {
        hints.prosody.speedAdjust = 0.1; // Slightly faster
        hints.opening.buildEnergy = true;
        hints.prosody.volumeAdjust = Math.min(hints.prosody.volumeAdjust * 1.1, 1.15);
        reasons.push('maintaining high energy');
      }

      // Low arousal (calm) should continue
      if (this.momentum.arousal < 0.4) {
        hints.prosody.speedAdjust = -0.1; // Slower
        hints.opening.pauseMs = 200;
        reasons.push('maintaining calm state');
      }
    }

    // Momentum trend adjustments
    if (this.momentum.trend === 'building') {
      hints.opening.buildEnergy = true;
      hints.prosody.speedAdjust = Math.min(hints.prosody.speedAdjust + 0.05, 0.2);
      reasons.push('energy building');
    } else if (this.momentum.trend === 'dissipating') {
      hints.opening.softStart = true;
      hints.prosody.speedAdjust = Math.max(hints.prosody.speedAdjust - 0.05, -0.2);
      reasons.push('energy settling');
    }

    // Incorporate emotional arc if available
    if (emotionalArc) {
      if (emotionalArc.needsEmotionalSupport) {
        hints.emotion.tag = 'empathetic';
        hints.emotion.intensity = 0.8;
        hints.opening.pauseMs = Math.max(hints.opening.pauseMs, 250);
        hints.closingWarmth = true;
        reasons.push('emotional support needed');
      }

      if (emotionalArc.suddenShiftDetected) {
        // After sudden shift, start fresh but gentle
        hints.opening.pauseMs = Math.max(hints.opening.pauseMs, 300);
        hints.opening.softStart = true;
        reasons.push('post-shift gentleness');
      }

      // Apply arc valence
      if (emotionalArc.currentValence > 0.5) {
        hints.emotion.tag = hints.emotion.tag === 'neutral' ? 'positive' : hints.emotion.tag;
        hints.prosody.pitchTendency = 'higher';
        reasons.push('positive arc');
      } else if (emotionalArc.currentValence < -0.3) {
        hints.emotion.tag = 'gentle';
        hints.prosody.pitchTendency = 'lower';
        reasons.push('supporting through difficulty');
      }
    }

    // Carry forward from recent utterance
    const lastUtterance = this.utteranceHistory[this.utteranceHistory.length - 1];
    if (lastUtterance) {
      // If last was highly supportive, continue the warmth
      if (lastUtterance.wasSupporting && lastUtterance.warmth === 'high') {
        hints.emotion.tag = 'empathetic';
        hints.closingWarmth = true;
        if (!reasons.includes('maintaining high warmth')) {
          reasons.push('continuing support');
        }
      }

      // Prevent jarring energy changes
      const arousalDiff = Math.abs(this.momentum.arousal - lastUtterance.arousal);
      if (arousalDiff > 0.3) {
        hints.opening.softStart = true;
        hints.opening.pauseMs = Math.max(hints.opening.pauseMs, 200);
        reasons.push('smoothing energy transition');
      }
    }

    hints.reason = reasons.length > 0 ? reasons.join(', ') : 'Default neutral state';

    // Clamp values
    hints.prosody.speedAdjust = Math.max(-0.3, Math.min(0.3, hints.prosody.speedAdjust));
    hints.prosody.volumeAdjust = Math.max(0.8, Math.min(1.2, hints.prosody.volumeAdjust));
    hints.opening.pauseMs = Math.max(0, Math.min(500, hints.opening.pauseMs));

    return hints;
  }

  /**
   * Apply continuity hints to SSML
   */
  applyContinuityToSsml(text: string, hints: ProsodyContinuityHints): string {
    let result = text;

    // Opening pause
    if (hints.opening.pauseMs >= 100) {
      result = `<break time="${hints.opening.pauseMs}ms"/>${result}`;
    }

    // Soft start: add a tiny pause after first few words
    if (hints.opening.softStart) {
      // Add pause after first comma or after ~3 words
      const words = result.split(' ');
      if (words.length > 3) {
        // Insert soft pause after 2-3 words
        const insertAt = Math.min(3, Math.floor(words.length * 0.2));
        words.splice(insertAt, 0, '<break time="80ms"/>');
        result = words.join(' ');
      }
    }

    // Closing warmth: slow down final phrase
    if (hints.closingWarmth) {
      // Add slight pause before final sentence if multiple sentences
      result = result.replace(/\.\s+([A-Z][^.!?]*[.!?])$/, '.<break time="150ms"/> $1');
    }

    return result;
  }

  /**
   * Get current emotional momentum
   */
  getMomentum(): EmotionalMomentum {
    return { ...this.momentum };
  }

  /**
   * Update momentum based on new utterance
   */
  private updateMomentum(state: UtteranceEmotionalState): void {
    const decay = CONTAGION_CONFIG.MOMENTUM_DECAY;

    // Blend new state with existing momentum
    const newValence = decay * this.momentum.valence + (1 - decay) * state.valence;
    const newArousal = decay * this.momentum.arousal + (1 - decay) * state.arousal;

    // Detect trend
    let trend: EmotionalMomentum['trend'] = 'stable';
    if (state.arousal > this.momentum.arousal + 0.1) {
      trend = 'building';
    } else if (state.arousal < this.momentum.arousal - 0.1) {
      trend = 'dissipating';
    }

    // Update warmth (warmth is sticky - doesn't change quickly)
    let newWarmth = this.momentum.warmth;
    if (state.wasSupporting || state.warmth === 'high') {
      newWarmth = 'high';
    } else if (
      this.momentum.turnsAtState > CONTAGION_CONFIG.MAX_WARMTH_TURNS &&
      this.momentum.warmth === 'high'
    ) {
      newWarmth = 'medium'; // Natural decay
    }

    // Update turns at state
    const sameState =
      Math.abs(newValence - this.momentum.valence) < 0.1 &&
      Math.abs(newArousal - this.momentum.arousal) < 0.1;

    this.momentum = {
      valence: newValence,
      arousal: newArousal,
      warmth: newWarmth,
      turnsAtState: sameState ? this.momentum.turnsAtState + 1 : 1,
      trend,
    };
  }

  /**
   * Create initial momentum state
   */
  private createInitialMomentum(): EmotionalMomentum {
    return {
      valence: 0.2, // Slightly positive default
      arousal: 0.5, // Moderate energy
      warmth: 'medium',
      turnsAtState: 0,
      trend: 'stable',
    };
  }

  /**
   * Reset service state
   */
  reset(): void {
    this.utteranceHistory = [];
    this.momentum = this.createInitialMomentum();
    log.debug({ sessionId: this.sessionId }, '💫 Emotional contagion reset');
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const sessionInstances = new Map<string, EmotionalContagionService>();

/**
 * Get or create emotional contagion service for a session
 */
export function getEmotionalContagionService(sessionId: string): EmotionalContagionService {
  if (!sessionInstances.has(sessionId)) {
    sessionInstances.set(sessionId, new EmotionalContagionService(sessionId));
  }
  return sessionInstances.get(sessionId)!;
}

/**
 * Reset emotional contagion for a session
 */
export function resetEmotionalContagion(sessionId: string): void {
  const instance = sessionInstances.get(sessionId);
  if (instance) {
    instance.reset();
    sessionInstances.delete(sessionId);
  }
}

/**
 * Reset all instances
 */
export function resetAllEmotionalContagion(): void {
  sessionInstances.clear();
}
