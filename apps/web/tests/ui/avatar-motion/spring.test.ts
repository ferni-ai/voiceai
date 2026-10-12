/** The damped spring and squash maths behind the avatar's spring body. */

import { describe, expect, it } from 'vitest';
import {
  MAX_DEFORMATION,
  isAtRest,
  squashScales,
  stepSpring,
  type SpringState,
} from '../../../src/ui/avatar-motion/spring.js';

function run(
  params: { omega: number; zeta: number },
  from: SpringState,
  target: number,
  frames: number
) {
  const xs: number[] = [];
  let s = from;
  for (let i = 0; i < frames; i++) {
    s = stepSpring(s, target, params, 1 / 60);
    xs.push(s.x);
  }
  return { xs, s };
}

describe('stepSpring', () => {
  it('a critically damped spring reaches the target without overshoot', () => {
    const { xs, s } = run({ omega: 12, zeta: 1 }, { x: 0, v: 0 }, 1, 120);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1);
    expect(s.x).toBeGreaterThan(0.999);
  });

  it('an underdamped spring overshoots the target, then settles', () => {
    const { xs, s } = run({ omega: 22, zeta: 0.3 }, { x: 0, v: 0 }, 1, 240);
    expect(Math.max(...xs)).toBeGreaterThan(1.2);
    expect(Math.abs(s.x - 1)).toBeLessThan(1e-3);
  });

  it('treats a huge frame gap as one 1/30 s step, so it never blows up', () => {
    const p = { omega: 30, zeta: 0.3 };
    const huge = stepSpring({ x: 0, v: 0 }, 1, p, 10);
    const capped = stepSpring({ x: 0, v: 0 }, 1, p, 1 / 30);
    expect(huge).toEqual(capped);
    expect(Number.isFinite(huge.x)).toBe(true);
    expect(Math.abs(huge.x)).toBeLessThan(2);
  });

  it('a velocity kick moves the spring away and brings it back', () => {
    const { xs, s } = run({ omega: 26, zeta: 0.35 }, { x: 0, v: -0.35 }, 0, 180);
    expect(Math.min(...xs)).toBeLessThan(-0.005);
    expect(Math.abs(s.x)).toBeLessThan(1e-4);
  });
});

describe('isAtRest', () => {
  it('is true only when settled on the target and still', () => {
    expect(isAtRest({ x: 0.5, v: 0 }, 0.5)).toBe(true);
    expect(isAtRest({ x: 0.5, v: 0.1 }, 0.5)).toBe(false);
    expect(isAtRest({ x: 0.49, v: 0 }, 0.5)).toBe(false);
  });
});

describe('squashScales', () => {
  it('preserves volume: sx * sy is 1', () => {
    for (const s of [-0.05, -0.02, 0, 0.013, 0.05]) {
      const { sx, sy } = squashScales(s);
      expect(sx * sy).toBeCloseTo(1, 12);
    }
  });

  it('stretches tall for positive and squashes short for negative', () => {
    expect(squashScales(0.03).sy).toBeCloseTo(1.03);
    expect(squashScales(0.03).sx).toBeLessThan(1);
    expect(squashScales(-0.03).sy).toBeCloseTo(0.97);
    expect(squashScales(-0.03).sx).toBeGreaterThan(1);
  });

  it('clamps deformation to 5% by default and to a given max', () => {
    expect(MAX_DEFORMATION).toBe(0.05);
    expect(squashScales(0.4).sy).toBeCloseTo(1.05);
    expect(squashScales(-0.4).sy).toBeCloseTo(0.95);
    expect(squashScales(0.4, 0.02).sy).toBeCloseTo(1.02);
  });
});
