/**
 * Lid expressions timed by feeling (motion T2 "C", Seth 2026-10-29).
 *
 * "Honor the Moment: heavy moments get weight, joyful moments get light."
 * With the weightedEasing switch on:
 * - light feelings (happy, delighted, pleased, warm, curious...) land in 350 ms
 *   with `power2.out`, and the body lifts a little;
 * - heavy feelings (sad, worried, empathetic, holding space...) settle over
 *   900 ms with `sine.inOut` and the body sinks a little; never an overshoot;
 * - everything else eases out over 500 ms;
 * - a held expression returns to the mood baseline (the last resting mood)
 *   instead of neutral.
 * - under prefers-reduced-motion every change is a 150 ms ease with no
 *   squeeze, lift or overshoot.
 * With it off every expression keeps the legacy elastic bounce, as before.
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
  /** Body posture in px: negative lifts (light), positive sinks (heavy). */
  liftPx: number;
}

/** The ease every expression used before this module (kept for the switch off). */
export const LEGACY_EASE = 'elastic.out(1, 0.7)';
export const HEAVY_EASE = 'sine.inOut';
export const NEUTRAL_EASE = 'power2.out';
export const LIGHT_EASE = 'power2.out';
export const REDUCED_MOTION_EASE = 'power1.out';

export const REDUCED_MOTION_MS = DURATION.FAST_RELEASE;

/** Small enough to read as posture, not a jump: the 1-2 px of the T2 taste clip. */
const POSTURE_PX = 1.5;

const HEAVY = new Set<string>([
  'sad',
  'worried',
  'empathetic',
  'holdingSpace',
  'absorbing',
  'holding',
]);

const LIGHT = new Set<string>([
  'happy',
  'delighted',
  'pleased',
  'warm',
  'curious',
  'excited',
  'celebrating',
]);

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

const LEGACY_MOTION = { ease: LEGACY_EASE, delayMs: DURATION.MICRO, anticipate: true, liftPx: 0 };
const REDUCED_MOTION: ExpressionMotion = {
  ease: REDUCED_MOTION_EASE,
  durationMs: REDUCED_MOTION_MS,
  delayMs: 0,
  anticipate: false,
  liftPx: 0,
};
const FEELING_MOTION: Readonly<Record<ExpressionWeight, ExpressionMotion>> = {
  light: {
    ease: LIGHT_EASE,
    durationMs: DURATION.EXPRESSION_LIGHT,
    delayMs: 0,
    anticipate: false,
    liftPx: -POSTURE_PX,
  },
  heavy: {
    ease: HEAVY_EASE,
    durationMs: DURATION.EXPRESSION_HEAVY,
    delayMs: 0,
    anticipate: false,
    liftPx: POSTURE_PX,
  },
  neutral: { ease: NEUTRAL_EASE, durationMs: DURATION.SLOWEST, delayMs: 0, anticipate: false, liftPx: 0 },
};

/**
 * The motion for a transition into `expression`. With the switch on the
 * feeling sets the timing and `requestedMs` is ignored; with it off this is the
 * legacy squeeze then elastic, over `requestedMs`.
 */
export function expressionMotion(
  expression: string,
  requestedMs: number,
  enabled: boolean = isWeightedEasingEnabled(),
  reducedMotion: boolean = enabled && prefersReducedMotion()
): ExpressionMotion {
  if (reducedMotion) return REDUCED_MOTION;
  if (!enabled) return { ...LEGACY_MOTION, durationMs: requestedMs };
  return FEELING_MOTION[expressionWeight(expression)];
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
