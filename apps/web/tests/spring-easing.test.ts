import { describe, expect, it } from 'vitest';
import { BODY_SPRING, FACE_SPRING, springEasing } from '../src/ui/face/spring-easing';

const points = (easing: string): number[] =>
  easing
    .replace(/^linear\(|\)$/g, '')
    .split(',')
    .map((x) => Number(x.trim()));

describe('springEasing', () => {
  it('starts at 0 and ends exactly at 1', () => {
    const p = points(springEasing(FACE_SPRING).easing);
    expect(p[0]).toBe(0);
    expect(p[p.length - 1]).toBe(1);
  });

  it('keeps the overshoot of an underdamped spring (follow-through)', () => {
    expect(Math.max(...points(springEasing(BODY_SPRING).easing))).toBeGreaterThan(1.02);
  });

  it('has no overshoot when critically damped', () => {
    expect(Math.max(...points(springEasing({ omega: 20, zeta: 1 }).easing))).toBeLessThanOrEqual(
      1.0001
    );
  });

  it('a stiffer spring settles sooner', () => {
    expect(springEasing({ omega: 30, zeta: 0.8 }).durationMs).toBeLessThan(
      springEasing({ omega: 10, zeta: 0.8 }).durationMs
    );
  });

  it('stays small enough for a style value', () => {
    expect(points(springEasing(BODY_SPRING).easing).length).toBeLessThanOrEqual(49);
  });
});
