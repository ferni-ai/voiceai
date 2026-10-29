/**
 * Dome poses (connect-polish C4, delight-lids Step 0): every lid dome is one cubic,
 * the approved shapes are unchanged from the `Q 50,k` table they replaced, no dome
 * reaches the eyes, and the overlay carries the 1px rim + the -1px inset.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DOME_POSES,
  MAX_DOME_DEPTH,
  bottomDomePath,
  domePaths,
  topDomePath,
} from '../../../src/ui/face/dome-poses.js';

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const read = (path: string): string => readFileSync(resolve(__dirname, '../../../', path), 'utf8');

/**
 * origin/main's table before Step 0 (9e20f6e786), frozen: `Q 50,top` and `Q 50,bottom`.
 * This is the shape Seth approved; the cubic must reproduce it.
 */
const MAIN_Q: Record<string, readonly [number, number]> = {
  neutral: [-10, 110],
  happy: [25, 85],
  delighted: [28, 82],
  surprised: [-18, 118],
  curious: [15, 100],
  sad: [35, 100],
  sleepy: [55, 70],
  thinking: [12, 95],
  empathetic: [20, 90],
  excited: [-12, 112],
  contemplative: [18, 92],
  noticing: [8, 100],
  holdingSpace: [22, 88],
  attentive: [5, 105],
  absorbing: [20, 92],
  receiving: [18, 90],
  curiousLean: [10, 102],
  warm: [12, 95],
  pleased: [18, 90],
  proud: [22, 88],
  celebrating: [26, 84],
  present: [10, 98],
  holding: [20, 90],
  accompanying: [18, 92],
  waiting: [15, 95],
  encouraging: [15, 92],
  challenging: [10, 98],
  reflecting: [14, 95],
  recognizing: [18, 90],
  remembering: [16, 94],
  reconnecting: [20, 88],
  insider: [22, 86],
  growing: [20, 88],
  processing: [18, 94],
  realizing: [-8, 108],
  shifting: [8, 100],
  settling: [14, 96],
  farewell: [22, 88],
};

type Point = readonly [number, number];

/** Parse `M x y C x1 y1 x2 y2 x y Z` and sample the cubic at t. */
function cubicAt(d: string, t: number): Point {
  const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  expect(n).toHaveLength(8);
  expect(d).toMatch(/^M[^QL]*C[^QL]*Z$/); // one cubic, no Q, no zero-length L
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [
    w[0] * n[0] + w[1] * n[2] + w[2] * n[4] + w[3] * n[6],
    w[0] * n[1] + w[1] * n[3] + w[2] * n[5] + w[3] * n[7],
  ];
}

/** The old dome `M x0,y0 Q 50,k 100,y0` at t. */
function quadAt(y0: number, k: number, t: number): Point {
  const u = 1 - t;
  return [2 * u * t * 50 + t * t * 100, u * u * y0 + 2 * u * t * k + t * t * y0];
}

const SAMPLES = [0, 0.25, 0.5, 0.75, 1];

function expectSameCurve(cubic: string, y0: number, k: number): void {
  for (const t of SAMPLES) {
    const [cx, cy] = cubicAt(cubic, t);
    const [qx, qy] = quadAt(y0, k, t);
    expect(Math.abs(cx - qx)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(cy - qy)).toBeLessThanOrEqual(0.01);
  }
}

describe('single-cubic domes reproduce the approved quadratics', () => {
  it.each([
    ['neutral', -5, -5], // bowed outside the head and clipped: reads as no dome
    ['happy', 12.5, 7.5],
    ['empathetic', 10, 5],
    ['sad', 17.5, 0],
    ['delighted', 14, 9],
  ] as const)('%s keeps its depths (top %s, bottom %s)', (name, top, bottom) => {
    const pose = DOME_POSES[name];
    const [qTop, qBottom] = MAIN_Q[name];
    expect(pose.top).toEqual([top, top]);
    expect(pose.bottom).toEqual([bottom, bottom]);
    const paths = domePaths(pose);
    expectSameCurve(paths.top, 0, qTop);
    expectSameCurve(paths.bottom, 100, qBottom);
  });

  it('every other symmetric pose matches main within 0.01 at t = 0, .25, .5, .75, 1', () => {
    for (const [name, [qTop, qBottom]] of Object.entries(MAIN_Q)) {
      const paths = domePaths(DOME_POSES[name as keyof typeof DOME_POSES]);
      expectSameCurve(paths.top, 0, qTop);
      expectSameCurve(paths.bottom, 100, qBottom);
    }
  });

  it('the two former two-segment poses are the closest single cubic', () => {
    const q = (p0: number, p1: number, p2: number, s: number): number =>
      (1 - s) * (1 - s) * p0 + 2 * (1 - s) * s * p1 + s * s * p2;
    // x(t) = 100t for both the cubics and these quadratic segments, so compare y at x.
    const skeptical = (x: number): number =>
      x <= 60 ? q(0, 20, 5, x / 60) : q(5, -5, 0, (x - 60) / 40);
    const worried = (x: number): number =>
      x <= 50 ? q(0, 25, 15, x / 50) : q(15, 25, 0, (x - 50) / 50);
    for (const [name, oldY, maxError] of [
      ['skeptical', skeptical, 1.2],
      ['worried', worried, 3.01],
    ] as const) {
      const top = topDomePath(DOME_POSES[name].top);
      for (let i = 0; i <= 20; i++) {
        const [x, y] = cubicAt(top, i / 20);
        expect(Math.abs(y - oldY(x))).toBeLessThanOrEqual(maxError);
      }
    }
  });

  it('each eye drives its own half of the dome (left = first control)', () => {
    const top = topDomePath([20, 0]);
    expect(cubicAt(top, 0.25)[1]).toBeGreaterThan(cubicAt(top, 0.75)[1]);
    const bottom = bottomDomePath([0, 20]);
    expect(cubicAt(bottom, 0.75)[1]).toBeLessThan(cubicAt(bottom, 0.25)[1]);
    // skeptical lowers the left lid and lifts the right one, as before
    const skeptical = topDomePath(DOME_POSES.skeptical.top);
    expect(cubicAt(skeptical, 0.3)[1]).toBeGreaterThan(8);
    expect(cubicAt(skeptical, 0.85)[1]).toBeLessThan(0);
  });

  it('every pose shares one path template, so any two poses blend and never snap', () => {
    const shapes = new Set(
      Object.values(DOME_POSES).flatMap((pose) => {
        const p = domePaths(pose);
        return [p.top, p.bottom].map((d) => d.replace(/-?\d+(?:\.\d+)?/g, '#'));
      })
    );
    expect([...shapes]).toEqual(['M# #C# # # # # #Z']);
  });
});

describe('dome depth', () => {
  it('no pose reaches within 7/100 of the eye top (max depth 29)', () => {
    expect(MAX_DOME_DEPTH).toBe(29);
    for (const [name, pose] of Object.entries(DOME_POSES)) {
      const p = domePaths(pose);
      let deepest = 0;
      for (let i = 0; i <= 100; i++) {
        deepest = Math.max(
          deepest,
          cubicAt(p.top, i / 100)[1],
          100 - cubicAt(p.bottom, i / 100)[1]
        );
      }
      expect(deepest, name).toBeLessThanOrEqual(29);
    }
  });
});

describe('C4 polish: rim and inset', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('the overlay sits 1px past the head and the rim is a soft persona-colour line', () => {
    const css = read('src/styles/inline-styles.css');
    const overlay = /\n\.avatar-lid-overlay \{([^}]*)\}/.exec(css)?.[1];
    expect(overlay).toMatch(/inset:\s*-1px;/);
    const rim = /\.avatar-lid-overlay \.lid-rim \{([^}]*)\}/.exec(css)?.[1];
    expect(rim).toMatch(/stroke:\s*var\(--persona-primary\);/);
    expect(rim).toMatch(/stroke-width:\s*1px;/);
    expect(rim).toMatch(/opacity:\s*0?\.35;/);
  });

  it('no CSS transition on d fights the GSAP dome tween', () => {
    expect(read('src/styles/inline-styles.css')).not.toMatch(/transition:\s*d\b/);
    expect(read('src/ui/ferni-expressions.ui.ts')).not.toMatch(/transition:\s*d\b/);
  });

  it('the injected expression styles do not redeclare the overlay box (it outranked the inset)', () => {
    const injected = /styleElement\.textContent = `([\s\S]*?)`;/.exec(
      read('src/ui/ferni-expressions.ui.ts')
    )?.[1];
    expect(injected).toBeDefined();
    expect(injected).not.toMatch(/\.avatar-lid-overlay\s*\{/);
  });

  it('the rendered overlay has the rim circle and starts on the neutral cubic domes', async () => {
    document.body.innerHTML = '<div id="coach"><div id="coachAvatar"></div></div>';
    const { gsap } = await import('gsap');
    (window as unknown as { gsap: typeof gsap }).gsap = gsap;
    const { initFerniExpressions } = await import('../../../src/ui/ferni-expressions.ui.js');
    initFerniExpressions();
    const rim = document.querySelector('.avatar-lid-overlay circle.lid-rim');
    expect(rim?.getAttribute('cx')).toBe('50');
    expect(rim?.getAttribute('cy')).toBe('50');
    expect(rim?.getAttribute('r')).toBe('49.5');
    expect(rim?.getAttribute('fill')).toBe('none');
    expect(rim?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    const neutral = domePaths(DOME_POSES.neutral);
    expect(document.querySelector('.avatar-lid-overlay .lid-top')?.getAttribute('d')).toBe(
      neutral.top
    );
    expect(document.querySelector('.avatar-lid-overlay .lid-bottom')?.getAttribute('d')).toBe(
      neutral.bottom
    );
  });
});
