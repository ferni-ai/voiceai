/**
 * Dome poses (connect-polish C4, delight-lids Step 0): every lid dome is two cubics
 * meeting at x = 50, the approved shapes are unchanged from the `Q 50,k` table they replaced, no dome
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
  quadraticHalves,
  topDomePath,
} from '../../../src/ui/face/dome-poses.js';

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const read = (path: string): string => readFileSync(resolve(__dirname, '../../../', path), 'utf8');

/**
 * origin/main's table before Step 0 (9e20f6e786), frozen: `Q 50,top` and `Q 50,bottom`.
 * This is the shape Seth approved; the two-cubic dome must reproduce it.
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

/** Parse `M x y C … 50 m C … 100 y Z` and sample the dome at t (0–.5 left half, .5–1 right). */
function domeAt(d: string, t: number): Point {
  const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  expect(n).toHaveLength(14);
  expect(d).toMatch(/^M[^QLC]*C[^QLC]*C[^QLC]*Z$/); // two cubics, no Q, no zero-length L
  const [s, base] = t <= 0.5 ? [t * 2, 0] : [t * 2 - 1, 6];
  const u = 1 - s;
  const w = [u * u * u, 3 * u * u * s, 3 * u * s * s, s * s * s];
  const at = (k: number) => w.reduce((sum, wi, i) => sum + wi * n[base + k + 2 * i], 0);
  return [at(0), at(1)];
}

/** A quadratic `M x0 y0 Q cx cy x1 y1` at s. */
function quadAt(p0: Point, c: Point, p1: Point, s: number): Point {
  const u = 1 - s;
  return [0, 1].map((k) => u * u * p0[k] + 2 * u * s * c[k] + s * s * p1[k]) as unknown as Point;
}

const SAMPLES = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];

/** The dome matches the old single `Q 50,k` (x = 100t on both, so compare at the same t). */
function expectSameAsQ(dome: string, edge: number, k: number): void {
  for (const t of SAMPLES) {
    const [dx, dy] = domeAt(dome, t);
    const [qx, qy] = quadAt([0, edge], [50, k], [100, edge], t);
    expect(Math.abs(dx - qx)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(dy - qy)).toBeLessThanOrEqual(0.01);
  }
}

describe('two-cubic domes reproduce the approved shapes', () => {
  it.each([
    ['neutral', -5, -5], // bowed outside the head and clipped: reads as no dome
    ['happy', 12.5, 7.5],
    ['empathetic', 10, 5],
    ['sad', 17.5, 0],
    ['delighted', 14, 9],
  ] as const)('%s keeps its depths (top %s, bottom %s)', (name, top, bottom) => {
    const pose = DOME_POSES[name];
    const [qTop, qBottom] = MAIN_Q[name];
    expect(pose.top).toEqual(quadraticHalves(top, top, top));
    expect(pose.bottom).toEqual(quadraticHalves(bottom, bottom, bottom));
    const paths = domePaths(pose);
    expectSameAsQ(paths.top, 0, qTop);
    expectSameAsQ(paths.bottom, 100, qBottom);
  });

  it('every symmetric pose matches main within 0.01 at nine points', () => {
    for (const [name, [qTop, qBottom]] of Object.entries(MAIN_Q)) {
      const paths = domePaths(DOME_POSES[name as keyof typeof DOME_POSES]);
      expectSameAsQ(paths.top, 0, qTop);
      expectSameAsQ(paths.bottom, 100, qBottom);
    }
  });

  it("worried reproduces main's two-Q knitted brow exactly, join included", () => {
    // main: M 0,0 Q 25,25 50,15 Q 75,25 100,0
    const top = topDomePath(DOME_POSES.worried.top);
    for (const s of SAMPLES) {
      const left = domeAt(top, s / 2);
      const right = domeAt(top, 0.5 + s / 2);
      const qLeft = quadAt([0, 0], [25, 25], [50, 15], s);
      const qRight = quadAt([50, 15], [75, 25], [100, 0], s);
      [0, 1].forEach((k) => {
        expect(Math.abs(left[k] - qLeft[k])).toBeLessThanOrEqual(0.01);
        expect(Math.abs(right[k] - qRight[k])).toBeLessThanOrEqual(0.01);
      });
    }
    expect(domeAt(top, 0.5)).toEqual([50, 15]);
  });

  it('worried keeps its notch: each half is deeper than the join (pin against flattening)', () => {
    const top = topDomePath(DOME_POSES.worried.top);
    const join = domeAt(top, 0.5)[1];
    expect(domeAt(top, 0.3)[1] - join).toBeGreaterThan(1.5);
    expect(domeAt(top, 0.7)[1] - join).toBeGreaterThan(1.5);
    // the halves meet in a V: the left descends into the join, the right climbs out of it
    const [, leftInner, centre, rightInner] = DOME_POSES.worried.top;
    expect(leftInner).toBeGreaterThan(centre);
    expect(rightInner).toBeGreaterThan(centre);
  });

  it("skeptical stays within 0.4 units of main's two Qs (they met at x = 60)", () => {
    const q = (p0: number, p1: number, p2: number, s: number): number =>
      (1 - s) * (1 - s) * p0 + 2 * (1 - s) * s * p1 + s * s * p2;
    // main: M 0,0 Q 30,20 60,5 Q 80,-5 100,0; x is linear in s on each segment
    const main = (x: number): number =>
      x <= 60 ? q(0, 20, 5, x / 60) : q(5, -5, 0, (x - 60) / 40);
    const top = topDomePath(DOME_POSES.skeptical.top);
    for (let i = 0; i <= 40; i++) {
      const [x, y] = domeAt(top, i / 40);
      expect(Math.abs(y - main(x))).toBeLessThanOrEqual(0.41);
    }
  });

  it('every pose but worried is smooth at the join (equal tangents at x = 50)', () => {
    for (const [name, pose] of Object.entries(DOME_POSES)) {
      if (name === 'worried') continue;
      for (const curve of [pose.top, pose.bottom]) {
        const [, leftInner, centre, rightInner] = curve;
        // controls sit 16.67 either side of the join, so equal slopes = equal steps
        expect(centre - leftInner, name).toBeCloseTo(rightInner - centre, 9);
      }
    }
  });

  it('each eye drives its own half of the dome', () => {
    const top = topDomePath(quadraticHalves(20, 0, 0));
    expect(domeAt(top, 0.25)[1]).toBeGreaterThan(5);
    expect(domeAt(top, 0.75)[1]).toBe(0);
    const bottom = bottomDomePath(quadraticHalves(0, 0, 20));
    expect(domeAt(bottom, 0.25)[1]).toBe(100);
    expect(domeAt(bottom, 0.75)[1]).toBeLessThan(95);
    // skeptical lowers the left lid and lifts the right one, as before
    const skeptical = topDomePath(DOME_POSES.skeptical.top);
    expect(domeAt(skeptical, 0.3)[1]).toBeGreaterThan(10);
    expect(domeAt(skeptical, 0.85)[1]).toBeLessThan(0);
  });

  it('every pose shares one path template, so any two poses blend and never snap', () => {
    const shapes = new Set(
      Object.values(DOME_POSES).flatMap((pose) => {
        const p = domePaths(pose);
        return [p.top, p.bottom].map((d) => d.replace(/-?\d+(?:\.\d+)?/g, '#'));
      })
    );
    expect([...shapes]).toEqual(['M# #C# # # # # #C# # # # # #Z']);
  });
});

describe('dome depth', () => {
  it('no pose reaches within 7/100 of the eye top (max depth 29)', () => {
    expect(MAX_DOME_DEPTH).toBe(29);
    for (const [name, pose] of Object.entries(DOME_POSES)) {
      const p = domePaths(pose);
      let deepest = 0;
      for (let i = 0; i <= 100; i++) {
        deepest = Math.max(deepest, domeAt(p.top, i / 100)[1], 100 - domeAt(p.bottom, i / 100)[1]);
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
