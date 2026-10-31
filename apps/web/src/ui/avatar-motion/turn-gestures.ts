/**
 * Turn gestures: anticipation and follow-through at turn changes.
 *
 * The turn driver sets the avatar's pose for each turn. This adds the small
 * movements a person makes between turns, layered on top of the body
 * animations already running (every gesture uses WAAPI `composite: 'add'`):
 *
 * - Into speaking: a short inhale (body lifts 2 px and stretches 1.5 %, eyes
 *   open a little), then a settle with a slight undershoot before rest.
 * - Into thinking: chin lifts, gaze moves up and to the right, breathing
 *   slows. Held until thinking ends, then eased back.
 * - Speaking to listening (or nobody): the body settles and the eyes blink once.
 *
 * Driven by the `ferni:avatar-turn` window event (detail `{ speaker }`), which
 * the turn driver dispatches once per settled turn change. Body gestures go
 * on `#coachAvatar` (inside the container the breathing loop owns), so they
 * compose with breathing, the body pulse and the thinking tilt instead of
 * competing with them. Nothing moves under prefers-reduced-motion.
 *
 * Off by default: the turnGestures switch in config/motion-flags.ts. It moves
 * only while the turn driver (turn-driver.ts, on by default) sends turns.
 *
 * Avatar audit item 5, "Anticipation beat and thinking pose".
 */

import { DURATION, EASING } from '../../config/animation-constants.js';
import { isMotionFlagOn } from '../../config/motion-flags.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('TurnGestures');

/** Dispatched on window by the turn driver once per settled turn change. */
export const AVATAR_TURN_EVENT = 'ferni:avatar-turn';

/** The anticipation inhale, inside the 120-180 ms window before speech. */
export const INHALE_MS = DURATION.FAST_RELEASE;
/** Settle after the inhale, with follow-through. */
export const FOLLOW_THROUGH_MS = DURATION.MODERATE;
/** Easing into and out of the thinking pose. */
export const THINK_POSE_MS = DURATION.DELIBERATE;
/** A blink: close and open on the eyes only. */
export const BLINK_MS = DURATION.FAST_RELEASE;
/** The blink lands a beat into the settle, not on the turn change itself. */
export const BLINK_DELAY_MS = DURATION.FAST;
/** Breathing plays at this rate while thinking. */
export const THINKING_BREATH_RATE = 0.75;

export type TurnPhase = 'speaking' | 'listening' | 'thinking';
export type Gesture = 'anticipate' | 'think' | 'release-think' | 'settle-blink';

/**
 * Read the event's speaker. The turn driver sends its Speaker type (ferni,
 * user, thinking, none); `none` reads as listening, since Ferni is waiting on
 * the caller. The speaking/listening names are accepted too, to be safe.
 */
export function phaseFrom(speaker: unknown): TurnPhase | null {
  switch (speaker) {
    case 'speaking':
    case 'ferni':
      return 'speaking';
    case 'listening':
    case 'user':
    case 'none':
      return 'listening';
    case 'thinking':
      return 'thinking';
    default:
      return null;
  }
}

/** The gestures a turn change plays, in order. */
export function gesturesFor(previous: TurnPhase | null, next: TurnPhase): Gesture[] {
  if (previous === next) return [];
  const gestures: Gesture[] = [];
  if (previous === 'thinking') gestures.push('release-think');
  if (next === 'speaking') gestures.push('anticipate');
  else if (next === 'thinking') gestures.push('think');
  else if (previous === 'speaking') gestures.push('settle-blink');
  return gestures;
}

const REST_BODY = 'translateY(0px) scaleY(1)';

/** Inhale, settle with a slight undershoot, rest. Offsets follow the durations. */
export function anticipationKeyframes(): { body: Keyframe[]; eyes: Keyframe[] } {
  const total = INHALE_MS + FOLLOW_THROUGH_MS;
  const peak = INHALE_MS / total;
  const undershoot = peak + (1 - peak) * 0.4;
  return {
    body: [
      { transform: REST_BODY, offset: 0, easing: EASING.DECELERATE },
      { transform: 'translateY(-2px) scaleY(1.015)', offset: peak, easing: EASING.STANDARD },
      { transform: 'translateY(0.5px) scaleY(0.997)', offset: undershoot, easing: EASING.GENTLE },
      { transform: REST_BODY, offset: 1 },
    ],
    eyes: [
      { transform: 'scaleY(1)', offset: 0, easing: EASING.DECELERATE },
      { transform: 'scaleY(1.06)', offset: peak, easing: EASING.STANDARD },
      { transform: 'scaleY(1)', offset: 1 },
    ],
  };
}

/** The thinking pose, held at its last frame until thinking ends. */
export const THINK_POSE: Readonly<{ body: Keyframe[]; eyes: Keyframe[] }> = {
  body: [{ transform: REST_BODY }, { transform: 'translateY(-1.5px) scaleY(1.008)' }],
  eyes: [{ transform: 'translate(0px, 0px)' }, { transform: 'translate(1.5px, -2px)' }],
};

export const SETTLE_KEYFRAMES: readonly Keyframe[] = [
  { transform: REST_BODY, offset: 0 },
  { transform: 'translateY(1px) scaleY(0.993)', offset: 0.4 },
  { transform: REST_BODY, offset: 1 },
];

export const BLINK_KEYFRAMES: readonly Keyframe[] = [
  { transform: 'scaleY(1)', offset: 0 },
  { transform: 'scaleY(0.1)', offset: 0.5 },
  { transform: 'scaleY(1)', offset: 1 },
];

/** Where gestures land; injectable for tests. */
export interface GestureTargets {
  /** The avatar body, inside the breathing container. */
  body(): Element | null;
  /** The eyes group. */
  eyes(): Element | null;
  /** The element whose looping animations are the breath. */
  breath(): Element | null;
}

export interface TurnGesturesDeps {
  targets: GestureTargets;
  reducedMotion(): boolean;
}

export interface TurnGestures {
  /** Feed the speaker from a turn event; plays the gestures for the change. */
  handle(speaker: unknown): void;
  /** Drop any held pose immediately and forget the last turn (call end). */
  reset(): void;
}

function play(
  element: Element | null,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions
): Animation | null {
  if (!element || typeof element.animate !== 'function') return null;
  try {
    return element.animate(keyframes, { ...options, composite: 'add' });
  } catch (error) {
    log.warn('Turn gesture could not play', { error });
    return null;
  }
}

function isLooping(animation: Animation): boolean {
  return animation.effect?.getTiming().iterations === Infinity;
}

export function createTurnGestures(deps: TurnGesturesDeps): TurnGestures {
  const { targets } = deps;
  let previous: TurnPhase | null = null;
  let held: Animation[] = [];
  let slowed: Array<{ animation: Animation; rate: number }> = [];

  const slowBreath = (): void => {
    const breath = targets.breath();
    if (!breath || typeof breath.getAnimations !== 'function') return;
    for (const animation of breath.getAnimations()) {
      if (!isLooping(animation)) continue;
      slowed.push({ animation, rate: animation.playbackRate });
      animation.updatePlaybackRate(animation.playbackRate * THINKING_BREATH_RATE);
    }
  };

  const restoreBreath = (): void => {
    for (const { animation, rate } of slowed) animation.updatePlaybackRate(rate);
    slowed = [];
  };

  const think = (): void => {
    const options: KeyframeAnimationOptions = {
      duration: THINK_POSE_MS,
      easing: EASING.GENTLE,
      fill: 'forwards',
    };
    held = [
      play(targets.body(), THINK_POSE.body, options),
      play(targets.eyes(), THINK_POSE.eyes, options),
    ].filter((animation): animation is Animation => animation !== null);
    slowBreath();
  };

  /** Ease the held pose back to rest, then drop it. */
  const releaseThink = (): void => {
    for (const animation of held) {
      animation.onfinish = () => animation.cancel();
      animation.reverse();
    }
    held = [];
    restoreBreath();
  };

  const dropHeld = (): void => {
    for (const animation of held) animation.cancel();
    held = [];
    restoreBreath();
  };

  const anticipate = (): void => {
    const frames = anticipationKeyframes();
    const options = { duration: INHALE_MS + FOLLOW_THROUGH_MS };
    play(targets.body(), frames.body, options);
    play(targets.eyes(), frames.eyes, options);
  };

  const settleAndBlink = (): void => {
    play(targets.body(), [...SETTLE_KEYFRAMES], {
      duration: FOLLOW_THROUGH_MS,
      easing: EASING.STANDARD,
    });
    play(targets.eyes(), [...BLINK_KEYFRAMES], {
      duration: BLINK_MS,
      delay: BLINK_DELAY_MS,
      easing: EASING.EXPO_IN_OUT,
    });
  };

  const run: Record<Gesture, () => void> = {
    anticipate,
    think,
    'release-think': releaseThink,
    'settle-blink': settleAndBlink,
  };

  return {
    handle(speaker) {
      const next = phaseFrom(speaker);
      if (next === null) {
        log.debug('Ignoring unknown avatar turn', { speaker });
        return;
      }
      const gestures = gesturesFor(previous, next);
      previous = next;
      const still = deps.reducedMotion();
      for (const gesture of gestures) {
        // Releasing only undoes motion, so it runs even under reduced motion.
        if (still && gesture !== 'release-think') continue;
        run[gesture]();
      }
    },
    reset() {
      dropHeld();
      previous = null;
    },
  };
}

export function isTurnGesturesEnabled(): boolean {
  return isMotionFlagOn('turnGestures');
}

const defaultDeps: TurnGesturesDeps = {
  targets: {
    body: () => document.getElementById('coachAvatar'),
    eyes: () => document.getElementById('avatarEyes'),
    breath: () => document.querySelector('.avatar-container'),
  },
  reducedMotion: () =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
};

let gestures: TurnGestures | null = null;

function onTurn(event: Event): void {
  const detail: unknown = (event as CustomEvent<unknown>).detail;
  const speaker =
    typeof detail === 'object' && detail !== null && 'speaker' in detail
      ? detail.speaker
      : undefined;
  gestures?.handle(speaker);
}

function onDisconnected(): void {
  gestures?.reset();
}

/**
 * Starts listening for turn changes when both flags are on. Pass whether the
 * turn driver started (`initAvatarTurns()`'s result): without it no turn
 * events arrive. Returns whether gestures are active.
 */
export function initTurnGestures(
  avatarTurnsActive: boolean,
  deps: TurnGesturesDeps = defaultDeps
): boolean {
  disposeTurnGestures();
  if (!avatarTurnsActive || !isTurnGesturesEnabled()) return false;
  gestures = createTurnGestures(deps);
  window.addEventListener(AVATAR_TURN_EVENT, onTurn);
  document.addEventListener('ferni:disconnected', onDisconnected);
  log.info('Turn gestures on');
  return true;
}

export function disposeTurnGestures(): void {
  window.removeEventListener(AVATAR_TURN_EVENT, onTurn);
  document.removeEventListener('ferni:disconnected', onDisconnected);
  gestures?.reset();
  gestures = null;
}
