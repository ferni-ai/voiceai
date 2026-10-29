/**
 * Idle life: the avatar at rest looks alive, warm and unhurried.
 *
 * Seth's taste call (motion audit 2026-10-29, T3 "B, plus C for upbeat"):
 * - the ring breathes 1.5 s behind the body, overlapping it instead of moving
 *   in lockstep. The body's visible breath is avatar-lamp's endless `scale`
 *   loop on `#coachAvatar` (the CSS `humanBreathing` loop there is masked by
 *   coach.ui's reaction bounce, which holds `transform` with fill forwards),
 *   so the ring's CSS breath is phase-locked to that loop: same cycle, started
 *   1.5 s later. It re-locks whenever the turn state changes (CSS restarts the
 *   ring's breath) and on every drift leg (the lamp restarts its breath after
 *   an emotion);
 * - the eyes drift slowly, no more than 2 px, to a new point every 8-15 s;
 * - the upbeat personas (persona-idle.ts) also glance aside every 12-25 s:
 *   250 ms out, a 600 ms hold, and back.
 * Drift and glances run only while nobody holds the turn; in a turn the gaze
 * module owns where the eyes look. Both are `translate` animations composited
 * with `add`, so they stack on the gaze offset and on the eyes' transforms.
 *
 * Under prefers-reduced-motion nothing here moves: no drift, no glance, no
 * re-lock, and the breath (body and ring) is already off. The timers pause in
 * a hidden tab.
 *
 * Off by default: the idleLife switch in config/motion-flags.ts.
 *
 * @module ui/avatar-motion/idle-life
 */

import { DURATION, EASING } from '../../config/animation-constants.js';
import { isMotionFlagOn } from '../../config/motion-flags.js';
import { createLogger } from '../../utils/logger.js';
import { AT_USER, LOOK_AWAY, type GazePoint } from './gaze.js';
import { activePersonaIdle } from './persona-idle.js';

const log = createLogger('IdleLife');

/** Set on `#coach` while idle life runs. */
export const IDLE_LIFE_ATTR = 'data-idle-life';

/** Furthest the eyes drift from where they look, in px. */
export const DRIFT_PX = 2;
/** Each drift leg lasts this long: one slow wander per 8-15 s. */
export const DRIFT_MIN_MS = DURATION.AMBIENT_GLACIAL;
export const DRIFT_MAX_MS = 15_000;
/** Gap between two glances of an upbeat persona. */
export const GLANCE_MIN_GAP_MS = 12_000;
export const GLANCE_MAX_GAP_MS = 25_000;
/** A glance: out, hold, and back. */
export const GLANCE_OUT_MS = DURATION.STANDARD;
export const GLANCE_HOLD_MS = 600;

/** How far the ring's breath trails the body's. */
export const RING_LAG_MS = DURATION.GLACIAL;
/** The ring's CSS breath (styles/inline-styles.css, connected idle only). */
export const RING_BREATH_NAME = 'humanBreathingRing';

/** What the ring needs to know about the body's breath loop. */
export interface BreathTiming {
  /** Timeline time the loop started, in ms. */
  startTime: number;
  /** One iteration, in ms. */
  duration: number;
  /** Plays forth and back (`direction: alternate`): a breath is two iterations. */
  alternate: boolean;
}

/**
 * The ring's breath timing for a body breath: one full breath per body breath
 * (the ring's keyframes go out and back in one iteration), started RING_LAG_MS
 * after the body's.
 */
export function ringBreathFor(body: BreathTiming): { startTime: number; duration: number } {
  return {
    startTime: body.startTime + RING_LAG_MS,
    duration: body.alternate ? 2 * body.duration : body.duration,
  };
}

export interface IdleLifeDeps {
  /** Move the drift to `to` over `ms`; `ms` 0 means jump there with no motion. */
  drift(to: GazePoint, ms: number): void;
  /** Play one glance aside and back. */
  glance(): void;
  /** Nobody holds the turn (not listening, speaking or thinking). */
  idle(): boolean;
  /** The persona on screen takes glances. */
  glances(): boolean;
  reducedMotion(): boolean;
  random(): number;
  /** Runs `fn` after `ms`; returns a cancel function. */
  schedule(fn: () => void, ms: number): () => void;
}

export interface IdleLife {
  start(): void;
  stop(): void;
}

/** A random point within the drift radius, uniform over the disc. */
function wander(random: () => number): GazePoint {
  const radius = DRIFT_PX * Math.sqrt(random());
  const angle = 2 * Math.PI * random();
  const round = (v: number): number => Math.round(v * 100) / 100;
  return { x: round(radius * Math.cos(angle)), y: round(radius * Math.sin(angle)) };
}

/** The idle-life policy, free of the DOM. */
export function createIdleLife(deps: IdleLifeDeps): IdleLife {
  let cancelDrift: (() => void) | null = null;
  let cancelGlance: (() => void) | null = null;
  const between = (min: number, max: number): number =>
    Math.round(min + deps.random() * (max - min));

  function driftLeg(): void {
    const ms = between(DRIFT_MIN_MS, DRIFT_MAX_MS);
    if (deps.reducedMotion()) deps.drift(AT_USER, 0);
    else deps.drift(deps.idle() ? wander(() => deps.random()) : AT_USER, ms);
    cancelDrift = deps.schedule(driftLeg, ms);
  }

  function nextGlance(): void {
    cancelGlance = deps.schedule(
      () => {
        if (deps.glances() && deps.idle() && !deps.reducedMotion()) deps.glance();
        nextGlance();
      },
      between(GLANCE_MIN_GAP_MS, GLANCE_MAX_GAP_MS)
    );
  }

  return {
    start() {
      if (cancelDrift) return;
      driftLeg();
      nextGlance();
    },
    stop() {
      cancelDrift?.();
      cancelGlance?.();
      cancelDrift = null;
      cancelGlance = null;
    },
  };
}

const px = (point: GazePoint): string => `${point.x}px ${point.y}px`;

/** One glance as `translate` frames: out, hold, back, on the token curve. */
export function glanceFrames(): Keyframe[] {
  const total = 2 * GLANCE_OUT_MS + GLANCE_HOLD_MS;
  return [
    { translate: px(AT_USER), easing: EASING.STANDARD },
    { translate: px(LOOK_AWAY), offset: GLANCE_OUT_MS / total },
    {
      translate: px(LOOK_AWAY),
      offset: (GLANCE_OUT_MS + GLANCE_HOLD_MS) / total,
      easing: EASING.STANDARD,
    },
    { translate: px(AT_USER) },
  ];
}

// ============================================================================
// DOM wiring
// ============================================================================

const TURN_CLASSES = ['is-speaking', 'is-listening', 'is-thinking'];

function keyframeEffect(animation: Animation): KeyframeEffect | null {
  const effect = animation.effect;
  return effect !== null && 'getKeyframes' in effect ? (effect as KeyframeEffect) : null;
}

/** avatar-lamp's breath: the endless `scale` loop on the body. */
function bodyBreath(body: Element): BreathTiming | null {
  for (const animation of body.getAnimations()) {
    const effect = keyframeEffect(animation);
    if (!effect || typeof animation.startTime !== 'number') continue;
    const timing = effect.getTiming();
    if (timing.iterations !== Infinity || typeof timing.duration !== 'number') continue;
    if (!effect.getKeyframes().some((frame) => 'scale' in frame)) continue;
    const alternate = timing.direction === 'alternate' || timing.direction === 'alternate-reverse';
    return { startTime: animation.startTime, duration: timing.duration, alternate };
  }
  return null;
}

/** Locks the ring's CSS breath to trail the body's; no-op when either isn't breathing. */
function lockRingBreath(ring: Element, body: Element): void {
  const breath = bodyBreath(body);
  const ringBreath = ring
    .getAnimations()
    .find((a) => 'animationName' in a && a.animationName === RING_BREATH_NAME);
  const effect = ringBreath ? keyframeEffect(ringBreath) : null;
  if (!breath || !ringBreath || !effect) return;
  const { startTime, duration } = ringBreathFor(breath);
  effect.updateTiming({ duration });
  ringBreath.startTime = startTime;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

let life: IdleLife | null = null;
let teardown: Array<() => void> = [];

/** Starts idle life when the switch is on; returns whether it started. */
export function initIdleLife(): boolean {
  disposeIdleLife();
  if (!isMotionFlagOn('idleLife')) return false;
  const coach = document.getElementById('coach');
  const eyes = document.getElementById('avatarEyes');
  const ring = document.getElementById('avatarRing');
  const body = document.getElementById('coachAvatar');
  if (!coach || !eyes || !ring || !body || typeof eyes.animate !== 'function') {
    log.warn('Avatar not found; idle life stays off');
    return false;
  }
  coach.setAttribute(IDLE_LIFE_ATTR, '');
  const relockRing = (): void => {
    if (!prefersReducedMotion()) lockRingBreath(ring, body);
  };

  let leg: Animation | null = null;
  let at: GazePoint = AT_USER;
  const current = createIdleLife({
    drift: (to, ms) => {
      relockRing();
      const next =
        ms > 0
          ? eyes.animate([{ translate: px(at) }, { translate: px(to) }], {
              duration: ms,
              easing: EASING.SMOOTH,
              fill: 'forwards',
              composite: 'add',
            })
          : null;
      leg?.cancel(); // after the next leg starts from the same point, so nothing jumps
      leg = next;
      at = to;
    },
    glance: () => {
      eyes.animate(glanceFrames(), {
        duration: 2 * GLANCE_OUT_MS + GLANCE_HOLD_MS,
        composite: 'add',
      });
    },
    idle: () => !TURN_CLASSES.some((name) => coach.classList.contains(name)),
    glances: () => activePersonaIdle().glances,
    reducedMotion: prefersReducedMotion,
    random: Math.random,
    schedule: (fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
  });
  life = current;
  const onVisibilityChange = (): void => {
    if (document.hidden) current.stop();
    else current.start();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  const turns = new MutationObserver(relockRing);
  turns.observe(coach, { attributes: true, attributeFilter: ['class'] });
  if (!document.hidden) current.start();
  teardown.push(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    turns.disconnect();
    leg?.cancel();
    coach.removeAttribute(IDLE_LIFE_ATTR);
  });
  log.info('Idle life on');
  return true;
}

export function disposeIdleLife(): void {
  life?.stop();
  life = null;
  teardown.forEach((undo) => undo());
  teardown = [];
}
