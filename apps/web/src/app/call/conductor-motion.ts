/**
 * Motion limits for the conductor's character policy: how far each easing
 * curve travels (does it overshoot its target, or wind up behind its start?),
 * and the clamp on how far a pop may grow or lift.
 */
import { EASING } from '../../config/animation-constants.js';

/** Lowest and highest point of a cubic-bezier with these y control points. */
const yRange = (y1: number, y2: number): readonly [number, number] => {
  let [lo, hi] = [0, 1];
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const y = 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3;
    [lo, hi] = [Math.min(lo, y), Math.max(hi, y)];
  }
  return [lo, hi];
};

/** How far each easing token (camelCase, as sequences name it) travels; keywords stay in 0..1. */
const RANGES: ReadonlyMap<string, readonly [number, number]> = new Map(
  Object.entries(EASING).map(([key, value]) => {
    const n = String.raw`\s*(-?[\d.]+)\s*`;
    const m = new RegExp(`^cubic-bezier\\(${n},${n},${n},${n}\\)$`).exec(value);
    const name = key.toLowerCase().replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
    return [name, m ? yRange(Number(m[2]), Number(m[4])) : ([0, 1] as const)] as const;
  })
);
const EPSILON = 1e-9;

/** True for an easing token that never winds up below 0 nor rises past `ceiling`. An allow-list:
 *  an unknown name (bounce, springHeavy, a GSAP string) is never within. */
export const easingStaysWithin = (name: string, ceiling: number): boolean => {
  const range = RANGES.get(name);
  return range !== undefined && range[0] >= -EPSILON && range[1] <= ceiling + EPSILON;
};

/** The highest point an easing token reaches (1 = no overshoot), or undefined if unknown. */
export const easingPeak = (name: string): number | undefined => RANGES.get(name)?.[1];

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
