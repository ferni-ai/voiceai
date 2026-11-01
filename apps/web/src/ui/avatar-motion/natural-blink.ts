/**
 * Natural blink: Ferni's eyes blink like a person's, on the eyes only.
 *
 * Behind the naturalBlink switch (config/motion-flags.ts, off by default). With it on:
 * - blink-scheduler.ts decides when: irregular 2-8 s gaps at the persona's
 *   pace (persona-idle.ts), the odd double blink, a blink at most turn changes
 *   (the `ferni:avatar-turn` event), and never in the middle of an expression
 *   change; it blinks while idle, listening and speaking alike;
 * - each blink is the Pixar blink Seth picked (motion audit 2026-10-29, T1 "C"):
 *   the upper lid falls fast (60 ms), rests 15 ms and lifts over 75 ms, drawn on
 *   the two `.eye-main` ellipses and composited with `add` so it stacks on
 *   whatever shape the eyes hold (speaking squint, wide listening eyes, an
 *   emotion) instead of replacing it; the body then settles a touch;
 * - sleepy, sad or tired eyes, and the small hours, get a slower heavier blink;
 * - the 6 s CSS idle blink loop and presence's whole-body "zen blink" stand
 *   down, so there is one blink and it never squashes the body.
 * Nothing blinks under prefers-reduced-motion or in deep sleep, and the
 * scheduler pauses while the tab is hidden.
 *
 * Avatar audit item 3, "Natural blink scheduler" (W13); motion audit P5.
 *
 * @module ui/avatar-motion/natural-blink
 */

import { DURATION, EASING } from '../../config/animation-constants.js';
import { isMotionFlagOn } from '../../config/motion-flags.js';
import { gsap } from '../../utils/gsap-setup.js';
import { createLogger } from '../../utils/logger.js';
import { createBlinkScheduler, type BlinkScheduler, type BlinkWeight } from './blink-scheduler.js';
import { activePersonaIdle } from './persona-idle.js';

const log = createLogger('NaturalBlink');

/** Dispatched on window once per settled turn change (see turn-driver). */
export const AVATAR_TURN_EVENT = 'ferni:avatar-turn';
/** Set on `#coach` while natural blink owns the blinks. */
export const NATURAL_BLINK_ATTR = 'data-natural-blink';
const STYLE_ID = 'natural-blink-styles';

/** Light blink 150 ms; its own frames set the close-fast, open-slower curve. */
export const BLINK_TIMING: Readonly<Record<BlinkWeight, { duration: number; easing: string }>> = {
  light: { duration: DURATION.FAST_RELEASE, easing: EASING.LINEAR },
  heavy: { duration: DURATION.STANDARD + DURATION.FAST, easing: EASING.EXPO_IN_OUT },
};

/**
 * A light blink, as in the approved lid prototype (delight-lids-2026-10-29):
 * closing takes 60 of its 150 ms, it stays shut 15 ms, then opens over 75 ms.
 */
export const LIGHT_BLINK_CLOSE_SHARE = 0.4;
export const LIGHT_BLINK_SHUT_SHARE = 0.1;

/**
 * How far the lower eye edge sits below the eye's transform origin, in the
 * 100-unit eye viewBox: the ellipses end at y 64 (cy 50 + ry 14) and
 * `.eye-main` scales about y 60 (`transform-origin: center 60%`).
 */
export const EYE_EDGE_BELOW_ORIGIN = 4;

/**
 * The eye squashed to `scale` with its lower edge held where it was, so the
 * upper lid does the travelling, as a real lid falls from the top.
 */
export function lidClosed(scale: number): string {
  const drop = Math.round(EYE_EDGE_BELOW_ORIGIN * (1 - scale) * 100) / 100;
  return `translateY(${drop}px) scaleY(${scale})`;
}

const LID_OPEN = lidClosed(1);

/** Eye frames added on top of the current eye shape. Heavy lingers shut. */
export const BLINK_FRAMES: Readonly<Record<BlinkWeight, Keyframe[]>> = {
  light: [
    { transform: LID_OPEN, easing: EASING.ACCELERATE },
    { transform: lidClosed(0.1), offset: LIGHT_BLINK_CLOSE_SHARE },
    {
      transform: lidClosed(0.1),
      offset: LIGHT_BLINK_CLOSE_SHARE + LIGHT_BLINK_SHUT_SHARE,
      easing: EASING.DECELERATE,
    },
    { transform: LID_OPEN },
  ],
  heavy: [
    { transform: LID_OPEN },
    { transform: lidClosed(0.06), offset: 0.4 },
    { transform: lidClosed(0.08), offset: 0.6 },
    { transform: LID_OPEN },
  ],
};

/** The body settles 1.5 px as the lid lifts, then recovers over 300 ms. */
export const BODY_DIP_PX = 1.5;
export const BODY_DIP_TIMING: Readonly<KeyframeAnimationOptions> = {
  delay: DURATION.FASTER,
  duration: DURATION.FASTER + DURATION.SLOW,
  composite: 'add',
};
export const BODY_DIP_FRAMES: readonly Keyframe[] = [
  { translate: '0px 0px', easing: EASING.DECELERATE },
  {
    translate: `0px ${BODY_DIP_PX}px`,
    offset: DURATION.FASTER / (DURATION.FASTER + DURATION.SLOW),
    easing: EASING.STANDARD,
  },
  { translate: '0px 0px' },
];

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

/** Draw one blink on the eyes, then the body's dip; returns the blink's duration in ms. */
export function drawBlink(weight: BlinkWeight): number {
  const timing = BLINK_TIMING[weight];
  for (const eye of eyes()) {
    if (typeof eye.animate !== 'function') continue;
    eye.animate(BLINK_FRAMES[weight], { ...timing, composite: 'add' });
  }
  // `translate` with `add` stacks on the breath (transform) and any parallax offset.
  const body = document.getElementById('coachAvatar');
  if (typeof body?.animate === 'function') body.animate([...BODY_DIP_FRAMES], BODY_DIP_TIMING);
  return timing.duration;
}

function canBlink(): boolean {
  if (prefersReducedMotion()) return false;
  if (coach()?.classList.contains('deep-sleep-mode')) return false;
  return eyes().length > 0;
}

/** ferni-expressions tweens the lid overlay with GSAP while an expression changes. */
function expressionChanging(): boolean {
  const lid = document.querySelector('.avatar-lid-overlay .lid-top');
  return lid !== null && gsap.isTweening(lid);
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

function onVisibilityChange(): void {
  if (document.hidden) scheduler?.stop();
  else scheduler?.start();
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
    busy: expressionChanging,
    pace: () => activePersonaIdle().blinkPace,
    random: Math.random,
    now: () => performance.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  if (!document.hidden) scheduler.start();
  window.addEventListener(AVATAR_TURN_EVENT, onTurn);
  document.addEventListener('visibilitychange', onVisibilityChange);
  log.info('Natural blink on');
  return true;
}

export function disposeNaturalBlink(): void {
  scheduler?.stop();
  scheduler = null;
  lastSpeaker = null;
  window.removeEventListener(AVATAR_TURN_EVENT, onTurn);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  coach()?.removeAttribute(NATURAL_BLINK_ATTR);
}
