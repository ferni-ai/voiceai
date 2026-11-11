/**
 * Eye acting: skin lids never leave the eye, every expression is its own, the
 * lids act the way the feelings read (tilt, cheek push, stretch), and the
 * crisis faces stay calm.
 */

import { describe, expect, it } from 'vitest';
import { CRISIS_CALM_FACES } from '../../../src/config/crisis-faces.js';
import { DOME_POSES } from '../../../src/ui/face/dome-poses.js';
import {
  EYE,
  type EyePose,
  type LidPose,
  browPath,
  eyePaths,
  eyeWhitePath,
} from '../../../src/ui/face/eye-acting.js';
import { EYE_POSES } from '../../../src/ui/face/eye-poses.js';

type Point = [number, number];

/** Every coordinate pair in a path: endpoints and control points alike. */
function points(d: string): Point[] {
  const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const out: Point[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]);
  return out;
}

/** The upper lid's points: everything before the `L` that starts the lower lid. */
function upperLid(d: string): Point[] {
  return points(d.slice(0, d.indexOf('L')));
}

const OPEN: LidPose = { top: 0, bottom: 0, arch: 0, tilt: 0, sx: 1, sy: 1 };
const names = Object.keys(EYE_POSES) as Array<keyof typeof EYE_POSES>;
const ys = (pts: Point[]): number[] => pts.map((p) => p[1]);
const height = (d: string): number => Math.max(...ys(points(d))) - Math.min(...ys(points(d)));

/** The stretched ellipse an eye's white must stay inside, from the pose alone. */
function ellipseOf(pose: EyePose, side: 'left' | 'right') {
  const lid = pose[side];
  const rx = EYE.rx * lid.sx;
  const ry = EYE.ry * lid.sy;
  const cx = (side === 'left' ? EYE.leftX : EYE.rightX) + pose.gx;
  const cy = EYE.cy + pose.gy + (EYE.ry - ry) * 0.2;
  return { cx, cy, rx, ry };
}

describe('eye acting', () => {
  it('has a pose for exactly the expressions the dome table has', () => {
    expect(names.slice().sort()).toEqual(Object.keys(DOME_POSES).sort());
  });

  it('never draws a lid outside its eye: every point, control points too, is inside the eye ellipse', () => {
    let checked = 0;
    for (const name of names) {
      const pose: EyePose = EYE_POSES[name];
      const paths = eyePaths(pose);
      for (const side of ['left', 'right'] as const) {
        const { cx, cy, rx, ry } = ellipseOf(pose, side);
        const pts = points(paths[side]);
        expect(pts.length, `${name} ${side} is drawn`).toBeGreaterThan(10);
        for (const [x, y] of pts) {
          const r = Math.hypot((x - cx) / rx, (y - cy) / ry);
          expect(r, `${name} ${side} (${x}, ${y})`).toBeLessThanOrEqual(1.002);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(names.length * 2 * 100);
  });

  it('never draws outside the eye for any lid shape a tween can pass through', () => {
    let checked = 0;
    for (const top of [0, 0.2, 0.4, 0.6, 0.8])
      for (const bottom of [0, 0.1, 0.2])
        for (const arch of [0, 0.5, 1])
          for (const tilt of [-0.5, 0, 0.5, 1])
            for (const [sx, sy] of [
              [0.9, 1.24],
              [1.1, 0.86],
              [1, 1],
            ]) {
              const lid = { top, bottom, arch, tilt, sx, sy };
              const rx = EYE.rx * sx;
              const ry = EYE.ry * sy;
              const cy = 50 + (EYE.ry - ry) * 0.2;
              for (const [x, y] of points(eyeWhitePath(32, 50, lid, 1))) {
                expect(Math.hypot((x - 32) / rx, (y - cy) / ry)).toBeLessThanOrEqual(1.002);
                checked++;
              }
            }
    expect(checked).toBeGreaterThan(50_000);
  });

  it('keeps even an out-of-range pose inside the eye (a tween overshoot, a bad table entry)', () => {
    const outOfRange: Array<Partial<LidPose>> = [
      { arch: 3 },
      { arch: 2, top: 0.4 },
      { top: 0.3, tilt: -3 },
      { top: -0.6 },
      { bottom: -0.6 },
      { sx: 1.6, sy: 0.5 },
    ];
    for (const extra of outOfRange) {
      const lid = { ...OPEN, ...extra };
      const rx = EYE.rx * lid.sx;
      const ry = EYE.ry * lid.sy;
      const cy = 50 + (EYE.ry - ry) * 0.2;
      const pts = points(eyeWhitePath(32, 50, lid, 1));
      expect(pts.length, JSON.stringify(extra)).toBeGreaterThan(10);
      for (const [x, y] of pts) {
        expect(Math.hypot((x - 32) / rx, (y - cy) / ry), JSON.stringify(extra)).toBeLessThanOrEqual(
          1.002
        );
      }
    }
  });

  it('keeps eyes and brows well inside the head at every pose', () => {
    for (const name of names) {
      for (const d of Object.values(eyePaths(EYE_POSES[name]))) {
        for (const [x, y] of points(d)) {
          expect(Math.hypot(x - 50, y - 50), `${name} (${x}, ${y})`).toBeLessThan(44);
        }
      }
    }
  });

  it('draws nothing when the lids meet', () => {
    expect(eyeWhitePath(32, 50, { ...OPEN, top: 1 }, 1)).toBe('');
    expect(eyeWhitePath(32, 50, { ...OPEN, top: 0.8, bottom: 0.4 }, 1)).toBe('');
    expect(eyeWhitePath(32, 50, OPEN, 1)).not.toBe('');
  });

  it('gives every expression its own look (no two draw the same)', () => {
    const seen = new Map<string, string>();
    for (const name of names) {
      const key = JSON.stringify([eyePaths(EYE_POSES[name]), EYE_POSES[name].roll]);
      expect(seen.get(key), `${name} draws the same as ${seen.get(key)}`).toBeUndefined();
      seen.set(key, name);
    }
  });

  it('mirrors a symmetric pose: the right eye is the left eye reflected about the face centre', () => {
    const { left, right } = eyePaths(EYE_POSES.worried);
    const mirrored = points(left)
      .map(([x, y]) => [100 - x, y])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const r = points(right).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    expect(r.length).toBe(mirrored.length);
    r.forEach(([x, y], i) => {
      expect(Math.abs(x - mirrored[i][0])).toBeLessThan(0.02);
      expect(Math.abs(y - mirrored[i][1])).toBeLessThan(0.02);
    });
  });

  it('worry drops the outer corner of the upper lid and lifts the inner brow', () => {
    const lidAt = (d: string, x0: number, x1: number): number =>
      Math.max(
        ...upperLid(d)
          .filter(([x]) => x >= x0 && x <= x1)
          .map(([, y]) => y)
      );
    const { left, browLeft } = eyePaths(EYE_POSES.worried);
    // left eye: outer side is small x, nose side is large x
    expect(lidAt(left, 23, 27)).toBeGreaterThan(lidAt(left, 37, 41) + 2);
    const [outer, , inner] = points(browLeft);
    expect(inner[1]).toBeLessThan(outer[1] - 3);
  });

  it('joy pushes the lower lid up; surprise stretches the eye tall', () => {
    const bottomOf = (d: string): number => Math.max(...ys(points(d)));
    const neutral = eyePaths(EYE_POSES.neutral).left;
    expect(bottomOf(eyePaths(EYE_POSES.happy).left)).toBeLessThan(bottomOf(neutral) - 4);
    expect(height(eyePaths(EYE_POSES.surprised).left)).toBeGreaterThan(height(neutral) * 1.15);
  });

  it('skepticism raises one brow and lowers the other', () => {
    const { browLeft, browRight } = eyePaths(EYE_POSES.skeptical);
    const mid = (d: string): number => points(d)[2][1];
    expect(mid(browRight)).toBeLessThan(mid(browLeft) - 3);
  });

  it('a raised brow sits higher, and a resting brow bows gently upward', () => {
    const rest = points(browPath(32, { lift: 0, inner: 0 }, 1));
    const raised = points(browPath(32, { lift: 4, inner: 0 }, 1));
    expect(raised[0][1]).toBeCloseTo(rest[0][1] - 4, 5);
    expect(rest[1][1]).toBeLessThan(rest[0][1]); // the control point lifts the middle
  });

  it('squashes and stretches the eye only for joy and surprise', () => {
    const stretched = names.filter((name) => {
      const { left, right } = EYE_POSES[name];
      return [left.sx, left.sy, right.sx, right.sy].some((s) => Math.abs(s - 1) > 0.05);
    });
    expect(stretched.sort()).toEqual(['celebrating', 'delighted', 'happy', 'surprised']);
  });

  describe('crisis faces stay calm', () => {
    const lidFaces = CRISIS_CALM_FACES.filter((f): f is keyof typeof EYE_POSES => f in EYE_POSES);

    it('covers every crisis face the lids can show', () => {
      // `listening` is a face-engine face, not a lid expression; if it becomes one, it is checked here too
      expect(lidFaces).toEqual(['holdingSpace', 'empathetic', 'attentive']);
    });

    it.each(['holdingSpace', 'empathetic', 'attentive'] as const)(
      '%s: no squash, no roll, no asymmetry, a soft slant, brows that never knit or rise in alarm',
      (name) => {
        const pose: EyePose = EYE_POSES[name];
        expect(pose.left).toEqual(pose.right);
        expect(pose.brows.left).toEqual(pose.brows.right);
        expect(pose.roll).toBe(0);
        expect([pose.left.sx, pose.left.sy]).toEqual([1, 1]);
        expect(pose.left.tilt).toBeGreaterThanOrEqual(0);
        expect(pose.left.tilt).toBeLessThanOrEqual(0.3);
        expect(pose.left.top).toBeLessThanOrEqual(0.25);
        expect(pose.brows.left.inner).toBeGreaterThanOrEqual(0);
        expect(pose.brows.left.inner).toBeLessThanOrEqual(2.5);
        expect(pose.brows.left.lift).toBeGreaterThanOrEqual(-0.5);
        expect(pose.brows.left.lift).toBeLessThanOrEqual(1);
        expect(Math.abs(pose.gx)).toBeLessThanOrEqual(1);
        expect(Math.abs(pose.gy)).toBeLessThanOrEqual(1.5);
      }
    );
  });
});
