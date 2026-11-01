/**
 * Conversational gaze: where Ferni's eyes look, and why.
 *
 * Without it, presence computes a mouse-following eye offset every frame and
 * writes it to a CSS variable nothing reads, so the eyes never move. On touch
 * there is no mouse at all. This module renders the offset (the `.avatar-eyes`
 * group moves 4 px at most) and gives it a conversational policy:
 *
 * - You talking: Ferni looks at you, with small saccades every 1-3 s.
 * - Ferni starting a turn: about 70 % of the time he glances away (up and
 *   right) for a moment, then comes back to you. Mid-turn he sometimes looks
 *   away briefly again. When he yields the turn, he looks straight at you.
 * - Ferni thinking: up and right, held.
 * - Nobody in a turn (idle): the pointer may bias the gaze.
 *
 * Speakers look away at turn start and back at turn end to hand over the
 * floor (Kendon 1967; Argyle & Cook 1976; Cassell et al. on embodied agents).
 *
 * Turns come from the `ferni:avatar-turn` window event. The avatar rect is
 * cached and refreshed on resize and scroll, never read per frame. Under
 * prefers-reduced-motion there are no saccades or glances: the eyes hold on
 * you (or up and right while thinking) and move without a transition.
 *
 * Off by default: the gaze switch in config/motion-flags.ts.
 *
 * Avatar audit item 10 (W12).
 */

import { isMotionFlagOn } from '../../config/motion-flags.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('AvatarGaze');

/** Dispatched on window by the turn driver, once per settled turn change. */
export const AVATAR_TURN_EVENT = 'ferni:avatar-turn';
/** Set on `.avatar-eyes` while gaze owns its offset. */
export const GAZE_ATTR = 'data-avatar-gaze';
const STYLE_ID = 'avatar-gaze-styles';

/**
 * `translate` is its own property, so it stacks with the `transform`
 * animations other modules run on the eyes (dance sway, listening nod)
 * instead of replacing them.
 */
export const GAZE_CSS = `
.avatar-eyes[${GAZE_ATTR}] {
  translate: var(--eye-offset-x, 0px) var(--eye-offset-y, 0px);
  transition: translate var(--duration-faster) var(--ease-out-quart);
}
@media (prefers-reduced-motion: reduce) {
  .avatar-eyes[${GAZE_ATTR}] { transition: none; }
}
`;

export type GazePhase = 'idle' | 'listening' | 'speaking' | 'thinking';

/** An eye offset in CSS px: +x is right, +y is down. */
export interface GazePoint {
  x: number;
  y: number;
}

export const MAX_GAZE_PX = 4;
export const AT_USER: Readonly<GazePoint> = { x: 0, y: 0 };
export const LOOK_AWAY: Readonly<GazePoint> = { x: 3, y: -2.5 };
export const THINKING_GAZE: Readonly<GazePoint> = { x: 3.5, y: -3 };
/** Radius of the small saccades around the user's face. */
export const SACCADE_PX = 1;
export const SACCADE_MIN_MS = 1000;
export const SACCADE_MAX_MS = 3000;
export const TURN_START_LOOK_AWAY_CHANCE = 0.7;
/** Chance that a saccade mid-turn is a brief glance away instead. */
export const MID_TURN_LOOK_AWAY_CHANCE = 0.2;
export const LOOK_AWAY_MIN_MS = 600;
export const LOOK_AWAY_MAX_MS = 1400;
/** Pointer closer than this to the avatar centre counts as centred. */
const POINTER_DEAD_ZONE_PX = 10;
/** Pointer interest fades out over this distance. */
const POINTER_FALLOFF_PX = 500;

export interface GazeDeps {
  render(point: GazePoint): void;
  random(): number;
  /** Runs `fn` after `ms`; returns a cancel function. */
  schedule(fn: () => void, ms: number): () => void;
  reducedMotion(): boolean;
}

export interface GazeController {
  setPhase(phase: GazePhase): void;
  /** Where the pointer pulls the eyes; only used while idle. */
  setPointerBias(point: GazePoint | null): void;
  phase(): GazePhase;
  dispose(): void;
}

function clampAxis(value: number): number {
  const clamped = Math.max(-MAX_GAZE_PX, Math.min(MAX_GAZE_PX, value));
  return Math.round(clamped * 100) / 100;
}

export function clampGaze(point: GazePoint): GazePoint {
  return { x: clampAxis(point.x), y: clampAxis(point.y) };
}

/** Maps a turn event's speaker to a gaze phase (turn-driver and cue names). */
export function phaseFromSpeaker(speaker: unknown): GazePhase {
  switch (speaker) {
    case 'speaking':
    case 'ferni':
      return 'speaking';
    case 'listening':
    case 'user':
      return 'listening';
    case 'thinking':
      return 'thinking';
    default:
      return 'idle';
  }
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The eye offset a pointer at (px, py) asks for, given the avatar's rect. */
export function pointerBias(px: number, py: number, rect: Rect): GazePoint {
  const dx = px - (rect.left + rect.width / 2);
  const dy = py - (rect.top + rect.height / 2);
  const distance = Math.hypot(dx, dy);
  if (distance <= POINTER_DEAD_ZONE_PX) return { ...AT_USER };
  const near = Math.min(distance / POINTER_FALLOFF_PX, 1);
  const interest = 1 - near * near * 0.5;
  return clampGaze({
    x: (dx / distance) * MAX_GAZE_PX * interest,
    y: (dy / distance) * MAX_GAZE_PX * interest * 0.6,
  });
}

/** The gaze policy, free of the DOM. */
export function createGaze(deps: GazeDeps): GazeController {
  let phase: GazePhase = 'idle';
  let pointer: GazePoint | null = null;
  let cancel: (() => void) | null = null;

  const clear = (): void => {
    cancel?.();
    cancel = null;
  };
  const between = (min: number, max: number): number => min + deps.random() * (max - min);
  const after = (ms: number, fn: () => void): void => {
    clear();
    cancel = deps.schedule(fn, ms);
  };
  const look = (point: GazePoint): void => deps.render(clampGaze(point));
  const nearUser = (): GazePoint => ({
    x: (deps.random() * 2 - 1) * SACCADE_PX,
    y: (deps.random() * 2 - 1) * SACCADE_PX * 0.6,
  });

  const nextSaccade = (): void => after(between(SACCADE_MIN_MS, SACCADE_MAX_MS), saccade);
  const glanceAway = (): void => {
    look(LOOK_AWAY);
    after(between(LOOK_AWAY_MIN_MS, LOOK_AWAY_MAX_MS), () => {
      look(AT_USER);
      nextSaccade();
    });
  };
  function saccade(): void {
    if (phase === 'speaking' && deps.random() < MID_TURN_LOOK_AWAY_CHANCE) return glanceAway();
    look(nearUser());
    nextSaccade();
  }

  const enter = (next: GazePhase, prev: GazePhase): void => {
    clear();
    if (deps.reducedMotion()) return look(next === 'thinking' ? THINKING_GAZE : AT_USER);
    switch (next) {
      case 'idle':
        return look(pointer ?? AT_USER);
      case 'thinking':
        return look(THINKING_GAZE);
      case 'listening':
        look(AT_USER);
        return nextSaccade();
      case 'speaking':
        if (prev !== 'speaking' && deps.random() < TURN_START_LOOK_AWAY_CHANCE) return glanceAway();
        look(AT_USER);
        return nextSaccade();
    }
  };

  return {
    setPhase(next) {
      if (next === phase) return;
      const prev = phase;
      phase = next;
      enter(next, prev);
    },
    setPointerBias(point) {
      pointer = point;
      if (phase === 'idle' && !deps.reducedMotion()) look(point ?? AT_USER);
    },
    phase: () => phase,
    dispose() {
      clear();
      look(AT_USER);
    },
  };
}

// ============================================================================
// DOM wiring
// ============================================================================

export function isGazeEnabled(): boolean {
  return isMotionFlagOn('gaze');
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = GAZE_CSS;
  document.head.appendChild(style);
}

function speakerOf(event: Event): unknown {
  if (!(event instanceof CustomEvent)) return undefined;
  const detail: unknown = event.detail;
  if (typeof detail !== 'object' || detail === null || !('speaker' in detail)) return undefined;
  return detail.speaker;
}

let controller: GazeController | null = null;
let teardown: Array<() => void> = [];

/** Capture phase, so scrolls inside any container also refresh the rect. */
function listen(target: Window | Document, type: string, handler: (event: Event) => void): void {
  target.addEventListener(type, handler, { passive: true, capture: true });
  teardown.push(() => target.removeEventListener(type, handler, { capture: true }));
}

/** Starts gaze when the flag is on; returns whether it now owns the eyes. */
export function initGaze(): boolean {
  disposeGaze();
  if (!isGazeEnabled()) return false;
  const eyes = document.getElementById('avatarEyes');
  if (!eyes) {
    log.warn('Avatar eyes not found; gaze stays off');
    return false;
  }
  ensureStyles();
  eyes.setAttribute(GAZE_ATTR, '');

  const current = createGaze({
    render: (point) => {
      eyes.style.setProperty('--eye-offset-x', `${point.x}px`);
      eyes.style.setProperty('--eye-offset-y', `${point.y}px`);
    },
    random: Math.random,
    schedule: (fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
    reducedMotion: prefersReducedMotion,
  });
  controller = current;

  const anchor = eyes.closest('#coachAvatar') ?? eyes;
  let rect: Rect = anchor.getBoundingClientRect();
  const measure = (): void => {
    rect = anchor.getBoundingClientRect();
  };
  let pointerAt: { x: number; y: number } | null = null;
  let frame: number | null = null;
  const onPointer = (event: Event): void => {
    if (!(event instanceof MouseEvent)) return;
    pointerAt = { x: event.clientX, y: event.clientY };
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (pointerAt) current.setPointerBias(pointerBias(pointerAt.x, pointerAt.y, rect));
    });
  };

  listen(window, AVATAR_TURN_EVENT, (event) =>
    current.setPhase(phaseFromSpeaker(speakerOf(event)))
  );
  listen(document, 'ferni:disconnected', () => current.setPhase('idle'));
  listen(window, 'resize', measure);
  listen(window, 'scroll', measure);
  listen(document, 'pointermove', onPointer);
  teardown.push(() => {
    if (frame !== null) cancelAnimationFrame(frame);
    eyes.removeAttribute(GAZE_ATTR);
    eyes.style.removeProperty('--eye-offset-x');
    eyes.style.removeProperty('--eye-offset-y');
  });
  log.info('Conversational gaze on');
  return true;
}

export function disposeGaze(): void {
  controller?.dispose();
  controller = null;
  teardown.forEach((undo) => undo());
  teardown = [];
}
