/**
 * Ferni's face as numbers: what each expression token means for his eyes,
 * lids, smile crease, halo and pose, in a form the renderer applies with
 * transforms and opacity only (no SVG `d` rewrites, so no layout per frame).
 *
 * The values come from design-system/tokens/expressions.json, the same data
 * the arrival prototype Seth approved draws from. Older code names faces
 * from its own list (ferni-expressions.ui.ts); ALIASES maps those to tokens,
 * so there is one name space. Pure: no DOM, no timers.
 *
 * Plan: docs/plans/2026-10-12-face-engine.md
 *
 * @module ui/face/face-model
 */

import {
  EXPRESSIONS,
  type ExpressionConfig,
  type ExpressionId,
} from '../../config/expressions.generated.js';

/** Names the older expression code uses that aren't token ids, and the token each means. */
export const ALIASES: Readonly<Record<string, ExpressionId>> = {
  accompanying: 'supportive',
  celebrating: 'joyful',
  challenging: 'determined',
  contemplative: 'thinking',
  curiousLean: 'curious',
  farewell: 'warm',
  growing: 'proud',
  holding: 'compassionate',
  holdingSpace: 'compassionate',
  insider: 'playful',
  noticing: 'attentive',
  realizing: 'surprised',
  receiving: 'tender',
  recognizing: 'warm',
  reconnecting: 'happy',
  remembering: 'thinking',
  settling: 'content',
  shifting: 'neutral',
  waiting: 'resting',
};

export function isFace(name: string): name is ExpressionId {
  return Object.hasOwn(EXPRESSIONS, name);
}

/** The token a name means: itself, its alias, or null when nothing matches. */
export function resolveFace(name: string): ExpressionId | null {
  if (isFace(name)) return name;
  return ALIASES[name] ?? null;
}

/**
 * One face, normalised. Lid coverages are fractions of the eye's height
 * (0 = lid clear of the eye, 1 = eye covered); `arch` is how much of the
 * lower lid is the happy upward arch (0..1), crossfaded in by opacity.
 */
export interface FaceGeometry {
  readonly eyeScaleX: number;
  readonly eyeScaleY: number;
  /** Per-eye overrides for asymmetric faces (skeptical, wink-like). */
  readonly leftEye: { readonly scaleX: number; readonly scaleY: number } | null;
  readonly rightEye: { readonly scaleX: number; readonly scaleY: number } | null;
  /** Gaze in avatar units (the eye svg's 0..100 box). */
  readonly gazeX: number;
  readonly gazeY: number;
  readonly upperLid: number;
  readonly lowerLid: number;
  readonly arch: number;
  readonly crease: number;
  readonly halo: number;
  readonly body: {
    readonly translateY: number;
    readonly rotate: number;
    readonly scaleX: number;
    readonly scaleY: number;
  };
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const curveOf = (c: ExpressionConfig['lidTop'] | undefined): number =>
  typeof c?.curve === 'number' && Number.isFinite(c.curve) ? c.curve : 0;

function bodyOf(transform: string | null): FaceGeometry['body'] {
  const t = transform ?? '';
  const num = (re: RegExp, d: number): number => {
    const m = re.exec(t);
    return m?.[1] === undefined ? d : Number.parseFloat(m[1]);
  };
  const scale = num(/(?:^|\s)scale\((-?[\d.]+)\)/, 1);
  return {
    translateY: num(/translateY\((-?[\d.]+)px\)/, 0),
    rotate: num(/rotate\((-?[\d.]+)deg\)/, 0),
    scaleX: scale * num(/scaleX\((-?[\d.]+)\)/, 1),
    scaleY: scale * num(/scaleY\((-?[\d.]+)\)/, 1),
  };
}

/**
 * The geometry of a token face. Lid curves follow the prototype: a positive
 * upper curve lowers the upper lid (sleepy, resting); a negative lower curve
 * lifts the lower lid into an arch (the ^ ^ of happy), and the upper lid then
 * comes down less so the eye reads as a crescent rather than a slit.
 */
export function faceGeometry(id: ExpressionId): FaceGeometry {
  const e = EXPRESSIONS[id];
  const top = curveOf(e.lidTop);
  const bot = curveOf(e.lidBottom);
  const happy = bot < 0;
  const scale = (s: ExpressionConfig['eyeLeftOverride']) =>
    s ? { scaleX: s.scaleX, scaleY: s.scaleY } : null;
  return {
    eyeScaleX: e.eyeWhite?.scaleX ?? 1,
    eyeScaleY: e.eyeWhite?.scaleY ?? 1,
    leftEye: scale(e.eyeLeftOverride),
    rightEye: scale(e.eyeRightOverride),
    gazeX: (e.eyesGroup?.translateX ?? 0) * 1.4,
    gazeY: (e.eyesGroup?.translateY ?? 0) * 1.4,
    upperLid: clamp(((top > 0 ? top : 0) * 0.9 * (happy ? 0.6 : 1)) / 100, 0, 0.95),
    lowerLid: happy ? 0 : clamp((bot * 0.5) / 100, 0, 0.6),
    arch: happy ? clamp((-bot * 3) / 100, 0, 0.85) : 0,
    crease: clamp(e.smileCrease?.opacity ?? 0, 0, 1),
    halo: clamp(e.presenceRing?.opacity ?? 0.2, 0, 1),
    body: bodyOf(e.body?.transform ?? null),
  };
}

// ---------------------------------------------------------------------------
// Who may change the face, and when
// ---------------------------------------------------------------------------

/** Highest first: a choreographed moment, then what the agent sent, then reactions, then ambient life. */
export type FaceSource = 'choreography' | 'agent' | 'reaction' | 'ambient';
const RANK: Readonly<Record<FaceSource, number>> = {
  choreography: 3,
  agent: 2,
  reaction: 1,
  ambient: 0,
};

export interface HeldFace {
  readonly id: ExpressionId;
  readonly source: FaceSource;
  /** Until when (ms since epoch) this face holds against lower sources. */
  readonly until: number;
}

/**
 * Whether a request may replace the face being held: never a repeat of the
 * same face (that is what re-animated the lids 4× per handoff), and a lower
 * source only once the held face's hold has ended.
 */
export function mayReplace(
  held: HeldFace | null,
  next: { id: ExpressionId; source: FaceSource },
  now: number
): boolean {
  if (!held) return true;
  if (held.id === next.id) return false;
  return RANK[next.source] >= RANK[held.source] || now >= held.until;
}
