/**
 * Natural blink: Ferni's eyes blink like a person's, on the eyes only.
 *
 * Behind the naturalBlink switch (config/motion-flags.ts, off by default). With it on:
 * - blink-scheduler.ts decides when: irregular 2-8 s gaps, the odd double
 *   blink, and a blink at most turn changes (the `ferni:avatar-turn` event);
 * - each blink is a short close-and-open on the two `.eye-main` ellipses,
 *   composited with `add` so it stacks on whatever shape the eyes hold
 *   (speaking squint, wide listening eyes, an emotion) instead of replacing it;
 * - sleepy, sad or tired eyes, and the small hours, get a slower heavier blink;
 * - the 6 s CSS idle blink loop and presence's whole-body "zen blink" stand
 *   down, so there is one blink and it never squashes the body.
 * Nothing blinks under prefers-reduced-motion, in deep sleep or in a hidden tab.
 *
 * Avatar audit item 3, "Natural blink scheduler" (W13).
 *
 * @module ui/avatar-motion/natural-blink
 */

import { DURATION, EASING } from '../../config/animation-constants.js';
import { isMotionFlagOn } from '../../config/motion-flags.js';
import { createLogger } from '../../utils/logger.js';
import { createBlinkScheduler, type BlinkScheduler, type BlinkWeight } from './blink-scheduler.js';

const log = createLogger('NaturalBlink');

/** Dispatched on window once per settled turn change (see turn-driver). */
export const AVATAR_TURN_EVENT = 'ferni:avatar-turn';
/** Set on `#coach` while natural blink owns the blinks. */
export const NATURAL_BLINK_ATTR = 'data-natural-blink';
const STYLE_ID = 'natural-blink-styles';

/** Light blink ~150 ms, close-and-open on a power4-style in-out curve. */
export const BLINK_TIMING: Readonly<Record<BlinkWeight, { duration: number; easing: string }>> = {
  light: { duration: DURATION.FAST_RELEASE, easing: EASING.EXPO_IN_OUT },
  heavy: { duration: DURATION.STANDARD + DURATION.FAST, easing: EASING.EXPO_IN_OUT },
};

/** Eye frames added on top of the current eye shape. Heavy lingers shut. */
export const BLINK_FRAMES: Readonly<Record<BlinkWeight, Keyframe[]>> = {
  light: [
    { transform: 'scaleY(1)' },
    { transform: 'scaleY(0.1)', offset: 0.45 },
    { transform: 'scaleY(1)' },
  ],
  heavy: [
    { transform: 'scaleY(1)' },
    { transform: 'scaleY(0.06)', offset: 0.4 },
    { transform: 'scaleY(0.08)', offset: 0.6 },
    { transform: 'scaleY(1)' },
  ],
};

/** Moods that make the lids heavy (`#coach[data-emotion]`). */
const HEAVY_EMOTIONS: ReadonlySet<string> = new Set(['sad', 'tired', 'sleepy']);

/**
 * The idle CSS loop (`natural-blink 6s` on connected idle eyes) would blink on
 * its own fixed beat. The attribute makes this selector more specific than
 * that rule, so the loop stops only while natural blink owns the eyes.
 */
export const NATURAL_BLINK_CSS = `
#coach.is-connected[${NATURAL_BLINK_ATTR}]:not(.is-speaking):not(.is-listening):not(.is-thinking) .avatar-eyes .eye-main { animation: none; }
`;

export function isNaturalBlinkEnabled(): boolean {
  return isMotionFlagOn('naturalBlink');
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Late at night (23:00-05:00 local), lids are heavier. */
export function isLateNight(date: Date): boolean {
  const hour = date.getHours();
  return hour >= 23 || hour < 5;
}

function coach(): HTMLElement | null {
  return document.getElementById('coach');
}

function eyes(): Element[] {
  return Array.from(document.querySelectorAll('#avatarEyes .eye-main'));
}

/** Draw one blink on the eyes; returns its duration in ms. */
export function drawBlink(weight: BlinkWeight): number {
  const timing = BLINK_TIMING[weight];
  for (const eye of eyes()) {
    if (typeof eye.animate !== 'function') continue;
    eye.animate(BLINK_FRAMES[weight], { ...timing, composite: 'add' });
  }
  return timing.duration;
}

function canBlink(): boolean {
  if (document.hidden || prefersReducedMotion()) return false;
  if (coach()?.classList.contains('deep-sleep-mode')) return false;
  return eyes().length > 0;
}

function isHeavy(): boolean {
  const el = coach();
  if (el?.classList.contains('sleep-mode')) return true;
  if (HEAVY_EMOTIONS.has(el?.getAttribute('data-emotion') ?? '')) return true;
  return isLateNight(new Date());
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = NATURAL_BLINK_CSS;
  document.head.appendChild(style);
}

let scheduler: BlinkScheduler | null = null;
let lastSpeaker: unknown = null;

function speakerOf(event: Event): unknown {
  return event instanceof CustomEvent && typeof event.detail === 'object' && event.detail !== null
    ? (event.detail as { speaker?: unknown }).speaker
    : undefined;
}

function onTurn(event: Event): void {
  const speaker = speakerOf(event);
  if (speaker === undefined || speaker === lastSpeaker) return;
  lastSpeaker = speaker;
  scheduler?.cue();
}

/** Blink with a gaze shift (for the gaze policy, audit item 10). No-op when off. */
export function cueBlink(): void {
  scheduler?.cue();
}

/** Starts natural blinking when the flag is on; returns whether it started. */
export function initNaturalBlink(): boolean {
  disposeNaturalBlink();
  if (!isNaturalBlinkEnabled()) return false;
  ensureStyles();
  coach()?.setAttribute(NATURAL_BLINK_ATTR, '');
  scheduler = createBlinkScheduler({
    blink: drawBlink,
    canBlink,
    heavy: isHeavy,
    random: Math.random,
    now: () => performance.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  scheduler.start();
  window.addEventListener(AVATAR_TURN_EVENT, onTurn);
  log.info('Natural blink on');
  return true;
}

export function disposeNaturalBlink(): void {
  scheduler?.stop();
  scheduler = null;
  lastSpeaker = null;
  window.removeEventListener(AVATAR_TURN_EVENT, onTurn);
  coach()?.removeAttribute(NATURAL_BLINK_ATTR);
}
