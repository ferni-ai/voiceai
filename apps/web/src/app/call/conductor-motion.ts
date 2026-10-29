/**
 * Motion limits for the conductor's character policy: which easing curves are
 * "still" (they never leave 0..1, so nothing overshoots its target or winds up
 * behind its start), and the clamp on how far a pop may grow or lift.
 */
import { EASING } from '../../config/animation-constants.js';

/** True when a cubic-bezier with these y control points leaves 0..1 (overshoot or wind-up). */
const leavesUnitRange = (y1: number, y2: number): boolean => {
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const y = 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3;
    if (y < -1e-9 || y > 1 + 1e-9) return true;
  }
  return false;
};

/** Easing tokens (camelCase, as sequences name them) that never leave 0..1. An allow-list:
 *  an unknown name (bounce, springHeavy, a GSAP string) counts as bouncy. */
const STILL_EASINGS: ReadonlySet<string> = new Set(
  Object.entries(EASING)
    .filter(([, value]) => {
      const n = String.raw`\s*(-?[\d.]+)\s*`;
      const m = new RegExp(`^cubic-bezier\\(${n},${n},${n},${n}\\)$`).exec(value);
      if (!m) return true; // linear and the ease-* keywords never overshoot
      return !leavesUnitRange(Number(m[2]), Number(m[4]));
    })
    .map(([key]) => key.toLowerCase().replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase()))
);

/** True for an easing token that never overshoots or winds up; false for any other name. */
export const isStillEasing = (name: string): boolean => STILL_EASINGS.has(name);

/** Caps every scale value at `maxScale` and every lift at `minTranslateY` (arrays too). */
export const clampMotion = (
  key: string,
  v: unknown,
  maxScale: number,
  minTranslateY: number
): unknown => {
  if (typeof v !== 'number') {
    return Array.isArray(v) ? v.map((x) => clampMotion(key, x, maxScale, minTranslateY)) : v;
  }
  if (key.startsWith('scale')) return Math.min(v, maxScale);
  return key === 'translateY' ? Math.max(v, minTranslateY) : v;
};
