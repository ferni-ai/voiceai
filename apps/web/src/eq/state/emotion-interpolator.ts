/**
 * Emotion Interpolator - Smooth Transitions
 *
 * Provides smooth interpolation between emotion states for
 * more natural-looking transitions.
 *
 * @module @ferni/eq/state/emotion-interpolator
 */

import { EMOTIONS, type EmotionId, type EmotionState } from '../../emotion/emotion-state.js';
import { areEmotionsInSameGroup } from './emotion-groups.js';

// ============================================================================
// INTERPOLATION
// ============================================================================

/**
 * Interpolate between two numeric values
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpolate between two emotion states
 *
 * @param from - Starting emotion
 * @param to - Target emotion
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated emotion state
 */
export function interpolateEmotions(
  from: EmotionState,
  to: EmotionState,
  t: number
): Partial<EmotionState> {
  // Clamp t to 0-1
  const factor = Math.max(0, Math.min(1, t));

  return {
    // Interpolate breathing
    breathing: {
      rate: Math.round(lerp(from.breathing.rate, to.breathing.rate, factor)),
      depth: lerp(from.breathing.depth, to.breathing.depth, factor),
      rhythm: factor < 0.5 ? from.breathing.rhythm : to.breathing.rhythm,
    },

    // Interpolate movement
    movement: {
      energy: lerp(from.movement.energy, to.movement.energy, factor),
      speed: lerp(from.movement.speed, to.movement.speed, factor),
      jitter: lerp(from.movement.jitter, to.movement.jitter, factor),
    },

    // Interpolate color intensity
    color: {
      primary: factor < 0.5 ? from.color.primary : to.color.primary,
      glow: factor < 0.5 ? from.color.glow : to.color.glow,
      intensity: lerp(from.color.intensity, to.color.intensity, factor),
    },

    // Interpolate waveform
    waveform: {
      shape: from.waveform.shape.map((val, i) =>
        lerp(val, to.waveform.shape[i] || val, factor)
      ),
      bounce: lerp(from.waveform.bounce, to.waveform.bounce, factor),
      smoothing: lerp(from.waveform.smoothing, to.waveform.smoothing, factor),
    },

    // Interpolate quirks (discrete values, use threshold)
    quirks: {
      blinkRate: Math.round(lerp(from.quirks.blinkRate, to.quirks.blinkRate, factor)),
      curiousTilts: factor < 0.5 ? from.quirks.curiousTilts : to.quirks.curiousTilts,
      warmthPulses: factor < 0.5 ? from.quirks.warmthPulses : to.quirks.warmthPulses,
    },
  };
}

/**
 * Get recommended transition duration between two emotions
 *
 * Emotions in the same group transition faster for smoother UX
 */
export function getTransitionDuration(from: EmotionId, to: EmotionId): number {
  // Same emotion = no transition
  if (from === to) return 0;

  // Same group = fast transition (200ms)
  if (areEmotionsInSameGroup(from, to)) {
    return 200;
  }

  // Get emotion states for intensity comparison
  const fromState = EMOTIONS[from];
  const toState = EMOTIONS[to];

  // Large energy difference = slower transition (600ms)
  const energyDiff = Math.abs(fromState.movement.energy - toState.movement.energy);
  if (energyDiff > 0.4) {
    return 600;
  }

  // Default transition (400ms)
  return 400;
}

/**
 * Get recommended easing for transition between two emotions
 */
export function getTransitionEasing(from: EmotionId, to: EmotionId): string {
  const fromState = EMOTIONS[from];
  const toState = EMOTIONS[to];

  // Increasing energy = more energetic easing
  if (toState.movement.energy > fromState.movement.energy) {
    return 'cubic-bezier(0.34, 1.56, 0.64, 1)'; // Spring
  }

  // Decreasing energy = gentler easing
  if (toState.movement.energy < fromState.movement.energy) {
    return 'cubic-bezier(0.4, 0.0, 0.2, 1)'; // Ease out
  }

  // Same energy = standard easing
  return 'cubic-bezier(0.4, 0.0, 0.6, 1)'; // Ease in-out
}

/**
 * Create a transition sequence for smooth emotion change
 */
export function createTransitionSequence(
  from: EmotionId,
  to: EmotionId,
  steps: number = 10
): Partial<EmotionState>[] {
  const fromState = EMOTIONS[from];
  const toState = EMOTIONS[to];
  const sequence: Partial<EmotionState>[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Use easeOutQuad for natural feel
    const easedT = 1 - Math.pow(1 - t, 2);
    sequence.push(interpolateEmotions(fromState, toState, easedT));
  }

  return sequence;
}
