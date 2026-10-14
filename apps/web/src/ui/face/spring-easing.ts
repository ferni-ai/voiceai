/**
 * A spring as a CSS easing, so the compositor plays it.
 *
 * Moving Ferni's face with JS on every frame restyles the page 60 times a
 * second, and moving anything inside an SVG lays it out 60 times a second.
 * Sampling the spring into a `linear()` easing and handing it to the Web
 * Animations API on HTML layers measured 0 layouts and 6 restyles a second
 * against 61/61 (voiceai-evidence/face-engine-2026-10-12/lid-bench). The feel
 * is the same spring the avatar already uses (avatar-motion/spring.ts).
 *
 * @module ui/face/spring-easing
 */

import { isAtRest, stepSpring, type SpringParams } from '../avatar-motion/spring.js';

export interface SpringEasing {
  /** A CSS `linear()` easing from 0 to 1 that traces the spring, overshoot included. */
  readonly easing: string;
  /** How long the spring takes to settle, in ms. */
  readonly durationMs: number;
}

const FRAME_SEC = 1 / 60;
const MAX_SEC = 3;
/** Points in the easing; enough to keep the overshoot's shape, few enough to stay small. */
const MAX_POINTS = 48;

const cache = new Map<string, SpringEasing>();

export function springEasing(p: SpringParams): SpringEasing {
  const key = `${p.omega}:${p.zeta}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const samples: number[] = [0];
  let s = { x: 0, v: 0 };
  let t = 0;
  while (t < MAX_SEC) {
    s = stepSpring(s, 1, p, FRAME_SEC);
    t += FRAME_SEC;
    samples.push(s.x);
    if (isAtRest(s, 1, 1e-3)) break;
  }
  samples[samples.length - 1] = 1;
  const stride = Math.max(1, Math.ceil(samples.length / MAX_POINTS));
  const points = samples.filter((_, i) => i % stride === 0 || i === samples.length - 1);
  const easing = `linear(${points.map((x) => Number(x.toFixed(4))).join(', ')})`;
  const made = { easing, durationMs: Math.round(t * 1000) };
  cache.set(key, made);
  return made;
}

/** The springs the face uses: a quick settle for eyes and lids, a softer one with overshoot for the body. */
export const FACE_SPRING: SpringParams = { omega: 22, zeta: 0.75 };
export const BODY_SPRING: SpringParams = { omega: 14, zeta: 0.55 };
