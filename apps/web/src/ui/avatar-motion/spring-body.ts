/**
 * Spring body: Ferni's avatar moves like a Pixar character. Before he speaks
 * he gathers himself (anticipation), the eyes move a beat before the body
 * (overlapping action), and every move settles with a small bounce
 * (follow-through). Squash and stretch never exceed 5% and keep volume.
 *
 * Transforms go through one compositor transform layer per element (an
 * additive Web Animation kept on top), so they stack on whatever else moves
 * the avatar (breathing, speaking pulse, GSAP reactions) and never touch
 * style.transform.
 *
 * Off by default: the springBody switch in config/motion-flags.ts.
 */

import { isMotionFlagOn } from '../../config/motion-flags.js';
import { createLogger } from '../../utils/logger.js';
import { addTransformLayer, type TransformLayer } from './compositor.js';
import {
  MAX_DEFORMATION,
  isAtRest,
  squashScales,
  stepSpring,
  type SpringParams,
  type SpringState,
} from './spring.js';

const log = createLogger('SpringBody');

export const SPRING_BODY_TURN_EVENT = 'ferni:avatar-turn';

/** Matches Speaker in speaker-cues.ui.ts (the turn driver's event names). */
export type SpringTurn = 'ferni' | 'user' | 'thinking' | 'none';
export type SpringKick = 'nod' | 'laugh';

export interface SpringBodyDeps {
  body: Element;
  eyes: Element | null;
  reducedMotion(): boolean;
  now(): number;
  raf(cb: () => void): number;
  caf(id: number): void;
  schedule(fn: () => void, ms: number): void;
}

export interface SpringBody {
  turn(t: SpringTurn): void;
  kick(k: SpringKick): void;
  dispose(): void;
}

interface Move {
  params: SpringParams;
  /** Eyes go first; the body follows this many ms later. */
  leadMs: number;
  target?: number;
  /** Hold `target` this long, then spring back to 0 (anticipation). */
  holdMs?: number;
  /** Velocity kicks, `kickGapMs` apart. */
  kicks?: number[];
  kickGapMs?: number;
}

const TURN_MOVES: Record<SpringTurn, Move> = {
  ferni: { params: { omega: 22, zeta: 0.45 }, leadMs: 120, target: -0.035, holdMs: 90 },
  user: { params: { omega: 12, zeta: 0.9 }, leadMs: 80, target: 0.012 },
  thinking: { params: { omega: 8, zeta: 1 }, leadMs: 100, target: -0.01 },
  none: { params: { omega: 16, zeta: 0.5 }, leadMs: 60, target: 0 },
};
const KICK_MOVES: Record<SpringKick, Move> = {
  nod: { params: { omega: 26, zeta: 0.35 }, leadMs: 60, kicks: [-0.35] },
  laugh: { params: { omega: 30, zeta: 0.3 }, leadMs: 100, kicks: [0.5, 0.5, 0.5], kickGapMs: 110 },
};
const EYE_OMEGA = 1.3;
const EYE_AMPLITUDE = 0.6;
const REDUCED_KICK_MS = 200;

interface Part {
  state: SpringState;
  target: number;
  params: SpringParams;
  scale: number;
  render(s: number, height: number): string;
  el: Element;
  layer: TransformLayer;
  moved: boolean;
  height: number;
}

// Squash about the base so the body stays planted; eyes ride up a little too.
const bodyTransform = (s: number, h: number): string => {
  const { sx, sy } = squashScales(s);
  return `translateY(${((1 - sy) * h) / 2}px) scale(${sx}, ${sy})`;
};
const eyesTransform = (s: number, h: number): string => {
  const { sx, sy } = squashScales(s * 0.5);
  return `translateY(${-Math.min(Math.max(s, -MAX_DEFORMATION), MAX_DEFORMATION) * h * 0.5}px) scale(${sx}, ${sy})`;
};

function makePart(el: Element, scale: number, render: Part['render']): Part {
  return {
    state: { x: 0, v: 0 },
    target: 0,
    params: TURN_MOVES.none.params,
    scale,
    render,
    el,
    layer: addTransformLayer(el),
    moved: false,
    height: 0,
  };
}

export function createSpringBody(deps: SpringBodyDeps): SpringBody {
  const body = makePart(deps.body, 1, bodyTransform);
  const parts = [body];
  const eyes = deps.eyes ? makePart(deps.eyes, EYE_AMPLITUDE, eyesTransform) : null;
  if (eyes) parts.push(eyes);
  let frameId: number | null = null;
  let last = 0;
  let generation = 0;

  const write = (p: Part): void => {
    p.layer.set(p.render(p.state.x, p.height));
    p.moved = true;
  };

  const frame = (): void => {
    const t = deps.now();
    const dt = (t - last) / 1000;
    last = t;
    let resting = true;
    for (const p of parts) {
      p.state = stepSpring(p.state, p.target, p.params, dt);
      if (isAtRest(p.state, p.target)) p.state = { x: p.target, v: 0 };
      else resting = false;
      write(p);
    }
    frameId = resting ? null : deps.raf(frame);
  };

  const wake = (): void => {
    if (frameId !== null) return;
    for (const p of parts) p.height = p.el.getBoundingClientRect().height;
    last = deps.now();
    frameId = deps.raf(frame);
  };

  /** Runs fn after ms unless the body was disposed or reset meanwhile. */
  const later = (fn: () => void, ms: number): void => {
    const gen = generation;
    const run = (): void => {
      if (gen === generation) fn();
    };
    if (ms <= 0) run();
    else deps.schedule(run, ms);
  };

  const apply = (p: Part, move: Move): void => {
    const isEyes = p === eyes;
    p.params = isEyes ? { ...move.params, omega: move.params.omega * EYE_OMEGA } : move.params;
    if (move.target !== undefined) p.target = move.target * p.scale;
    if (move.holdMs) later(() => ((p.target = 0), wake()), move.holdMs);
    (move.kicks ?? []).forEach((kick, i) =>
      later(
        () => ((p.state = { ...p.state, v: p.state.v + kick * p.scale }), wake()),
        i * (move.kickGapMs ?? 0)
      )
    );
    wake();
  };

  const play = (move: Move): void => {
    if (eyes) apply(eyes, move);
    later(() => apply(body, move), eyes ? move.leadMs : 0);
  };

  const pulse = (): void => {
    const t = (offset: number, scale: number): Keyframe => ({
      offset,
      transform: `scale(${scale})`,
      composite: 'add',
    });
    const o = (offset: number, opacity: number): Keyframe => ({ offset, opacity });
    deps.body.animate([t(0, 1), o(0, 1), t(0.5, 1.01), o(0.5, 0.9), t(1, 1), o(1, 1)], {
      duration: REDUCED_KICK_MS,
      easing: 'ease-in-out',
    });
  };

  const reset = (): void => {
    if (typeof document === 'undefined' || !document.hidden) return;
    generation++;
    if (frameId !== null) deps.caf(frameId);
    frameId = null;
    for (const p of parts) {
      p.state = { x: p.target, v: 0 };
      if (p.moved) write(p);
    }
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', reset);

  return {
    turn(t) {
      if (!deps.reducedMotion()) play(TURN_MOVES[t]);
    },
    kick(k) {
      if (deps.reducedMotion()) pulse();
      else play(KICK_MOVES[k]);
    },
    dispose() {
      generation++;
      if (frameId !== null) deps.caf(frameId);
      frameId = null;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', reset);
      for (const p of parts) p.layer.dispose();
    },
  };
}

export function isSpringBodyEnabled(): boolean {
  return isMotionFlagOn('springBody');
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Both vocabularies: the turn driver's Speaker and the avatar contract's phase. */
const TURN_NAMES: Readonly<Record<string, SpringTurn>> = {
  ferni: 'ferni',
  user: 'user',
  thinking: 'thinking',
  none: 'none',
  speaking: 'ferni',
  listening: 'user',
  idle: 'none',
};
export function springTurnFrom(v: unknown): SpringTurn | null {
  return typeof v === 'string' && Object.hasOwn(TURN_NAMES, v) ? (TURN_NAMES[v] ?? null) : null;
}

let active: SpringBody | null = null;

/** Other modules call these; they do nothing until initSpringBody() starts the body. */
export const springBody: Pick<SpringBody, 'turn' | 'kick'> = {
  turn: (t) => active?.turn(t),
  kick: (k) => active?.kick(k),
};

function onTurnEvent(e: Event): void {
  const speaker: unknown =
    e instanceof CustomEvent ? (e.detail as { speaker?: unknown } | null)?.speaker : undefined;
  const turn = springTurnFrom(speaker);
  if (turn) springBody.turn(turn);
  else log.warn('Ignoring avatar turn event without a known speaker', { speaker });
}

/** Starts the spring body when the flag is on; returns whether it runs. */
export function initSpringBody(): boolean {
  if (!isSpringBodyEnabled()) return false;
  if (active) return true;
  const body =
    document.querySelector('#coach .avatar-container') ??
    document.querySelector('.avatar-container');
  if (!body || typeof body.animate !== 'function') {
    log.warn('Avatar body not found or Web Animations unavailable; spring body off');
    return false;
  }
  active = createSpringBody({
    body,
    eyes: body.querySelector('.avatar-eyes'),
    reducedMotion: prefersReducedMotion,
    now: () => performance.now(),
    raf: (cb) => requestAnimationFrame(cb),
    caf: (id) => cancelAnimationFrame(id),
    schedule: (fn, ms) => void setTimeout(fn, ms),
  });
  window.addEventListener(SPRING_BODY_TURN_EVENT, onTurnEvent);
  log.info('Spring body on');
  return true;
}

export function disposeSpringBody(): void {
  window.removeEventListener(SPRING_BODY_TURN_EVENT, onTurnEvent);
  active?.dispose();
  active = null;
}
