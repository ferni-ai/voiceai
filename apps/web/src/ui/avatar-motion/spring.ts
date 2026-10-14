/**
 * A damped spring for avatar motion: the maths behind squash, stretch and
 * follow-through. Pure functions, no DOM, so the feel can be tested exactly.
 *
 * Semi-implicit Euler in fixed 1/240 s substeps stays stable for the stiff,
 * bouncy settings the avatar uses. A frame gap longer than 1/30 s (a dropped
 * frame, a background tab) is treated as 1/30 s so the body never jumps.
 */

/** omega: natural frequency in rad/s. zeta: damping ratio (1 = no overshoot). */
export interface SpringParams {
  omega: number;
  zeta: number;
}

/** x: position. v: velocity in units per second. */
export interface SpringState {
  x: number;
  v: number;
}

const SUBSTEP_SEC = 1 / 240;
const MAX_DT_SEC = 1 / 30;
/** The largest squash or stretch the body may show: 5%. */
export const MAX_DEFORMATION = 0.05;

/** Advances the spring toward `target` by `dtSec` seconds. */
export function stepSpring(
  s: SpringState,
  target: number,
  p: SpringParams,
  dtSec: number
): SpringState {
  let remaining = Math.min(Math.max(dtSec, 0), MAX_DT_SEC);
  let { x, v } = s;
  while (remaining > 0) {
    const h = Math.min(SUBSTEP_SEC, remaining);
    const accel = -p.omega * p.omega * (x - target) - 2 * p.zeta * p.omega * v;
    v += accel * h;
    x += v * h;
    remaining -= h;
  }
  return { x, v };
}

/** True when the spring has settled on `target` and stopped moving. */
export function isAtRest(s: SpringState, target: number, eps = 1e-4): boolean {
  return Math.abs(s.x - target) < eps && Math.abs(s.v) < eps;
}

/**
 * Volume-preserving squash and stretch: positive `stretch` makes the body
 * taller and narrower, negative makes it shorter and wider, and sx * sy
 * stays 1. The stretch is clamped to +/- `max`.
 */
export function squashScales(stretch: number, max = MAX_DEFORMATION): { sx: number; sy: number } {
  const s = Math.min(Math.max(stretch, -max), max);
  const sy = 1 + s;
  return { sx: 1 / sy, sy };
}
