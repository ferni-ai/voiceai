/**
 * Eye acting: Ferni's expressions drawn by the eyes themselves (skin lids and
 * soft brows), not by caps laid over the head.
 *
 * The lids are skin. Nothing is drawn over an eye: each eye's white is its
 * ellipse cut by an upper and a lower lid line, so wherever a lid covers the
 * eye the head (its gradient, shine and persona colour) shows through. Every
 * control point is kept inside the eye's ellipse, and an ellipse is convex, so
 * no curve can leave it: a lid can never draw outside its eye.
 *
 * The lid lines follow the iOS shader's (FerniDesign/Alive/AliveShader.swift
 * `lidLines`), so web and iOS act alike:
 *   - a closing upper lid wraps the eyeball and peaks slightly toward the nose;
 *   - `tilt` drops the outer corner (worry, tenderness) or the inner (focus);
 *   - `arch` lifts the lower lid in the middle, the cheek push of a real smile.
 * The pose for every expression lives in ./eye-poses.ts.
 *
 * Coordinates: the avatar's 100×100 eye viewBox (index.html #avatarEyes), y
 * down. Eyes at (32, 50) and (68, 50), radii 11 × 14. Head roll is the
 * renderer's: it rotates the whole eye group about the head's centre.
 *
 * @module ui/face/eye-acting
 */

export interface LidPose {
  /** Upper lid closure, 0 open … 1 shut. */
  readonly top: number;
  /** Lower lid closure, 0 open … 1 shut. */
  readonly bottom: number;
  /** Lower lid lifted in the middle (the cheek push of a smile), 0 … 1. */
  readonly arch: number;
  /** Upper lid slant: + drops the outer corner, − drops the inner corner. */
  readonly tilt: number;
  /** Eye stretch, width and height (1 = the eye as drawn today). */
  readonly sx: number;
  readonly sy: number;
}

export interface BrowPose {
  /** Lift, viewBox units, + up. */
  readonly lift: number;
  /** Inner end above the outer end, viewBox units (+ worry, − a knit frown). */
  readonly inner: number;
}

export interface EyePose {
  readonly left: LidPose;
  readonly right: LidPose;
  readonly brows: { readonly left: BrowPose; readonly right: BrowPose };
  /** Gaze shift of both eyes, viewBox units. */
  readonly gx: number;
  readonly gy: number;
  /** Head roll in degrees (curiosity's tilt), applied by the renderer. */
  readonly roll: number;
}

export interface EyePaths {
  readonly left: string;
  readonly right: string;
  readonly browLeft: string;
  readonly browRight: string;
}

/** The eyes as drawn in index.html: centres, radii and the shared centre line. */
export const EYE = { leftX: 32, rightX: 68, cy: 50, rx: 11, ry: 14 } as const;

const SAMPLES = 48;
/** Squash and stretch pivot: 20% of the radius below the centre, so a squashed eye sits down, not up. */
const PIVOT = 0.2;

/**
 * Upper and lower lid heights (y up, in ry units) at u = x / rx.
 * `inner` is +1 for the left eye (its nose side is +x) and −1 for the right.
 */
function lidLines(u: number, p: LidPose, inner: number): { t: number; b: number } {
  const e = Math.sqrt(Math.max(0, 1 - u * u));
  const closing = Math.sin(Math.PI * p.top);
  const t =
    (1 - 2 * p.top) * e +
    0.22 * closing * (1 - u * u) + // a closing lid wraps the eyeball
    -p.tilt * 0.275 * (1 - u * inner) + // slant: the outer end drops by tilt
    0.04 * closing * u * inner * (1 - u * u); // slight S: the peak leans toward the nose
  const b = -(1 - 2 * p.bottom) * e + p.arch * 1.12 * (1 - u * u);
  return { t, b };
}

function fmt(v: number): string {
  return String(Math.round(v * 100) / 100);
}

type Point = readonly [number, number];

/** Pulls a point onto the ellipse if it lies outside it. */
function inside(pt: Point, cx: number, cy: number, rx: number, ry: number): Point {
  const dx = (pt[0] - cx) / rx;
  const dy = (pt[1] - cy) / ry;
  const r = Math.hypot(dx, dy);
  return r <= 1 ? pt : [cx + (dx / r) * rx, cy + (dy / r) * ry];
}

/** The point at `i`, held to the ends of the list (Catmull-Rom repeats the end points). */
function at(points: readonly Point[], i: number): Point {
  const pt = points[Math.min(points.length - 1, Math.max(0, i))];
  if (!pt) throw new Error('eye-acting: empty lid line');
  return pt;
}

/** Catmull-Rom through `points` as cubic segments, every control point kept inside the ellipse. */
function smooth(points: readonly Point[], clamp: (pt: Point) => Point): string {
  let d = '';
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = at(points, i - 1);
    const p1 = at(points, i);
    const p2 = at(points, i + 1);
    const p3 = at(points, i + 2);
    const c1 = clamp([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]);
    const c2 = clamp([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]);
    d += `C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  return d;
}

/**
 * The visible white of one eye as a closed path, or '' when the lids meet.
 * `cx`/`cy` place the eye (gaze included); `inner` is +1 left, −1 right.
 */
export function eyeWhitePath(cx: number, cy: number, p: LidPose, inner: number): string {
  const rx = EYE.rx * p.sx;
  const ry = EYE.ry * p.sy;
  const ecy = cy + (EYE.ry - ry) * PIVOT;
  const clamp = (pt: Point): Point => inside(pt, cx, ecy, rx, ry);
  const upper: Point[] = [];
  const lower: Point[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    // cosine spacing: more samples near the corners, where the outline turns fastest
    const u = -Math.cos((Math.PI * i) / SAMPLES);
    const { t, b } = lidLines(u, p, inner);
    const e = Math.sqrt(Math.max(0, 1 - u * u));
    const top = Math.min(e, t);
    const bot = Math.max(-e, b);
    if (top <= bot + 1e-3) continue;
    upper.push(clamp([cx + u * rx, ecy - top * ry]));
    lower.push(clamp([cx + u * rx, ecy - bot * ry]));
  }
  if (upper.length < 3) return '';
  lower.reverse();
  const [ux, uy] = at(upper, 0);
  const [lx, ly] = at(lower, 0);
  return `M${fmt(ux)} ${fmt(uy)}${smooth(upper, clamp)}L${fmt(lx)} ${fmt(ly)}${smooth(lower, clamp)}Z`;
}

/** A soft bowed brow above one eye, as an open quadratic (the renderer strokes it). */
export function browPath(cx: number, brow: BrowPose, inner: number): string {
  const y0 = 31 - brow.lift;
  const half = 8;
  const xi = cx + inner * half;
  const xo = cx - inner * half;
  const yi = y0 - brow.inner / 2;
  const yo = y0 + brow.inner / 2;
  const bow = -1.6 + Math.min(1.2, Math.abs(brow.inner) * 0.18); // straighter when slanted
  return `M${fmt(xo)} ${fmt(yo)}Q${fmt((xi + xo) / 2)} ${fmt((yi + yo) / 2 + bow)} ${fmt(xi)} ${fmt(yi)}`;
}

/** Both eyes' whites and both brows for a pose. Brows follow the gaze at 40%. */
export function eyePaths(pose: EyePose): EyePaths {
  const cy = EYE.cy + pose.gy;
  return {
    left: eyeWhitePath(EYE.leftX + pose.gx, cy, pose.left, 1),
    right: eyeWhitePath(EYE.rightX + pose.gx, cy, pose.right, -1),
    browLeft: browPath(EYE.leftX + pose.gx * 0.4, pose.brows.left, 1),
    browRight: browPath(EYE.rightX + pose.gx * 0.4, pose.brows.right, -1),
  };
}
