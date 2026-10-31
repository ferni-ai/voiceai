/**
 * Weight-aware easing for Ferni's lid expressions.
 *
 * "Honor the Moment: heavy moments get weight, joyful moments get light."
 * Today every lid expression bounces in with the same elastic ease, and a held
 * expression snaps back to neutral. With the flag on:
 * - heavy expressions (sad, worried, holding space...) glide in with
 *   `sine.inOut` over 600-900 ms, with no anticipation squeeze or overshoot;
 * - light expressions (happy, delighted, excited, celebrating) keep the spring;
 * - everything else eases out with `power2.out`;
 * - under prefers-reduced-motion every expression becomes a 150 ms crossfade;
 * - a held expression returns to the mood baseline (the last resting mood)
 *   instead of neutral.
 *
 * Off by default: the weightedEasing switch in config/motion-flags.ts.
 */

import { DURATION } from '../../config/animation-constants.js';
import { isMotionFlagOn } from '../../config/motion-flags.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ExpressionEasing');

export type ExpressionWeight = 'heavy' | 'neutral' | 'light';

/** How one lid transition should move. */
export interface ExpressionMotion {
  ease: string;
  durationMs: number;
  /** Delay before the main tween (room for the anticipation squeeze). */
  delayMs: number;
  /** Play the small squeeze before the main tween. */
  anticipate: boolean;
}

/** The ease every expression used before this module (kept for flag off). */
export const LEGACY_EASE = 'elastic.out(1, 0.7)';
export const HEAVY_EASE = 'sine.inOut';
export const NEUTRAL_EASE = 'power2.out';
export const LIGHT_EASE = LEGACY_EASE;
export const REDUCED_MOTION_EASE = 'power1.out';

// The 600-900 ms heavy glide is the face's own range. It was DURATION.DRAMATIC,
// which became 1000 ms (above HEAVY_MAX_MS) when the scale moved; held at 600
// so the face keeps its timing until the face PR revisits it.
export const HEAVY_MIN_MS = 600;
export const HEAVY_MAX_MS = 900;
export const REDUCED_MOTION_MS = DURATION.FAST_RELEASE;

const HEAVY = new Set<string>([
  'sad',
  'worried',
  'empathetic',
  'holdingSpace',
  'absorbing',
  'holding',
]);

const LIGHT = new Set<string>(['happy', 'delighted', 'excited', 'celebrating']);

/**
 * Resting moods: expressions that can stay on the face as a baseline.
 * Quick reactions (surprised, noticing, realizing...) never become the baseline,
 * so a held reaction settles back to how Ferni was feeling before it.
 */
const MOODS = new Set<string>([
  'neutral',
  'happy',
  'warm',
  'pleased',
  'present',
  'attentive',
  'curious',
  'contemplative',
  'empathetic',
  'sad',
  'worried',
  'holdingSpace',
  'holding',
  'accompanying',
  'sleepy',
  'settling',
]);

let moodBaseline = 'neutral';

export function isWeightedEasingEnabled(): boolean {
  return isMotionFlagOn('weightedEasing');
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (error) {
    log.debug('Reduced-motion query failed, assuming full motion', { error });
    return false;
  }
}

export function expressionWeight(expression: string): ExpressionWeight {
  if (HEAVY.has(expression)) return 'heavy';
  if (LIGHT.has(expression)) return 'light';
  return 'neutral';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The motion for a transition into `expression`. With the flag off this is the
 * legacy motion: anticipation squeeze, then elastic for every expression.
 */
export function expressionMotion(
  expression: string,
  requestedMs: number,
  enabled: boolean = isWeightedEasingEnabled(),
  reducedMotion: boolean = enabled && prefersReducedMotion()
): ExpressionMotion {
  if (!enabled) {
    return {
      ease: LEGACY_EASE,
      durationMs: requestedMs,
      delayMs: DURATION.MICRO,
      anticipate: true,
    };
  }
  if (reducedMotion) {
    return {
      ease: REDUCED_MOTION_EASE,
      durationMs: REDUCED_MOTION_MS,
      delayMs: 0,
      anticipate: false,
    };
  }
  switch (expressionWeight(expression)) {
    case 'heavy':
      return {
        ease: HEAVY_EASE,
        durationMs: clamp(requestedMs, HEAVY_MIN_MS, HEAVY_MAX_MS),
        delayMs: 0,
        anticipate: false,
      };
    case 'light':
      return {
        ease: LIGHT_EASE,
        durationMs: requestedMs,
        delayMs: DURATION.MICRO,
        anticipate: true,
      };
    default:
      return { ease: NEUTRAL_EASE, durationMs: requestedMs, delayMs: 0, anticipate: false };
  }
}

/**
 * Record an expression that was just set. One set with no hold that is a
 * resting mood becomes the baseline; held reactions never do.
 */
export function noteExpressionSet(expression: string, holdMs: number): void {
  if (holdMs === 0 && MOODS.has(expression)) moodBaseline = expression;
}

/** Let a caller (e.g. a reply-tone signal) set the resting mood directly. */
export function setMoodBaseline(expression: string): void {
  moodBaseline = expression;
}

export function getMoodBaseline(): string {
  return moodBaseline;
}

function isKnown<T extends string>(key: string, known: Readonly<Record<T, unknown>>): key is T {
  return Object.prototype.hasOwnProperty.call(known, key);
}

/**
 * Where a held expression settles: the mood baseline with the flag on (when it
 * is one of `known`), else `fallback` (neutral).
 */
export function holdReturnTarget<T extends string>(
  fallback: T,
  known: Readonly<Record<T, unknown>>,
  enabled: boolean = isWeightedEasingEnabled()
): T {
  return enabled && isKnown(moodBaseline, known) ? moodBaseline : fallback;
}
