/**
 * Blink scheduler: when Ferni blinks, as pure timing logic.
 *
 * People don't blink on a metronome. Gaps between blinks are irregular
 * (roughly log-normal, a few seconds on average), about one blink in eight
 * comes as a quick double, and blinks bunch up where attention moves: at the
 * change of turn and when the gaze shifts. Sleepy or sad eyes blink slower and
 * heavier. This module decides when and what kind of blink; the DOM side
 * (natural-blink.ts) draws it on the eyes only.
 *
 * Avatar audit item 3 (W13). Everything time- or chance-based is injected so
 * tests can drive it with fake timers and a seeded random source.
 *
 * @module ui/avatar-motion/blink-scheduler
 */

import { DURATION } from '../../config/animation-constants.js';

/** Shortest and longest gap between two blinks. */
export const MIN_BLINK_GAP_MS = 2000;
export const MAX_BLINK_GAP_MS = 8000;
/** Median gap: with the spread below the mean lands near 3.5 s. */
export const MEDIAN_BLINK_GAP_MS = 3200;
/** Spread of the log-normal gap distribution (sigma of ln gap). */
export const BLINK_GAP_SIGMA = 0.45;
/** Share of blinks that come as a quick double. */
export const DOUBLE_BLINK_CHANCE = 0.12;
/** Pause between the two halves of a double blink, after the first ends. */
export const DOUBLE_BLINK_PAUSE_MS = DURATION.FAST;
/** Chance that a turn change or a gaze shift brings a blink with it. */
export const CUE_BLINK_CHANCE = 0.8;
/** A cued blink lands this long after the cue, so it reads as part of it. */
export const CUE_BLINK_DELAY_MIN_MS = DURATION.MICRO;
export const CUE_BLINK_DELAY_MAX_MS = DURATION.STANDARD;
/** No two separate blinks closer than this (a double blink is one blink). */
export const MIN_BLINK_SPACING_MS = DURATION.DRAMATIC;

/** How a blink looks: a light everyday blink, or a slow heavy one. */
export type BlinkWeight = 'light' | 'heavy';

export interface BlinkDeps {
  /** Draw one blink; returns how long it takes in ms. */
  blink(weight: BlinkWeight): number;
  /** Whether the eyes should blink at all right now (visible, awake, motion allowed). */
  canBlink(): boolean;
  /** Whether a blink should be heavy (sleepy, sad, late at night). */
  heavy(): boolean;
  random(): number;
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface BlinkScheduler {
  start(): void;
  stop(): void;
  /** Something drew the eye (turn change, gaze shift): blink with it, usually. */
  cue(): void;
  /** Whether the scheduler is running. */
  running(): boolean;
}

/** Standard normal sample (Box-Muller) from a uniform source. */
function normal(random: () => number): number {
  const u = Math.max(random(), Number.EPSILON);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** One gap between blinks: log-normal around the median, clamped to 2-8 s. */
export function sampleBlinkGapMs(random: () => number): number {
  const gap = MEDIAN_BLINK_GAP_MS * Math.exp(BLINK_GAP_SIGMA * normal(random));
  return Math.round(Math.min(MAX_BLINK_GAP_MS, Math.max(MIN_BLINK_GAP_MS, gap)));
}

export function createBlinkScheduler(deps: BlinkDeps): BlinkScheduler {
  let timer: unknown = null;
  let active = false;
  let lastBlinkAt = Number.NEGATIVE_INFINITY;

  const clear = (): void => {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
  };

  const later = (fn: () => void, ms: number): void => {
    clear();
    timer = deps.setTimer(() => {
      timer = null;
      fn();
    }, ms);
  };

  const scheduleNext = (): void =>
    later(
      blinkNow,
      sampleBlinkGapMs(() => deps.random())
    );

  function blinkNow(): void {
    if (!active) return;
    if (deps.canBlink()) {
      lastBlinkAt = deps.now();
      const weight: BlinkWeight = deps.heavy() ? 'heavy' : 'light';
      const took = deps.blink(weight);
      if (deps.random() < DOUBLE_BLINK_CHANCE) {
        later(() => {
          if (active && deps.canBlink()) deps.blink(weight);
          scheduleNext();
        }, took + DOUBLE_BLINK_PAUSE_MS);
        return;
      }
    }
    scheduleNext();
  }

  return {
    start() {
      if (active) return;
      active = true;
      scheduleNext();
    },
    stop() {
      active = false;
      clear();
    },
    cue() {
      if (!active) return;
      if (deps.now() - lastBlinkAt < MIN_BLINK_SPACING_MS) return;
      if (deps.random() >= CUE_BLINK_CHANCE) return;
      const span = CUE_BLINK_DELAY_MAX_MS - CUE_BLINK_DELAY_MIN_MS;
      // Replaces the pending idle blink: the gap restarts from this blink.
      later(blinkNow, CUE_BLINK_DELAY_MIN_MS + Math.round(deps.random() * span));
    },
    running: () => active,
  };
}
