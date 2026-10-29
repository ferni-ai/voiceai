/**
 * Dome poses: the white caps over the head's top and bottom edge that carry
 * Ferni's expression (ivory #E6DFD4 in midnight, never the page colour).
 *
 * Every dome is two cubics that meet at x = 50, one over each eye, in the
 * overlay's 100×100 viewBox:
 *   top     M0 0C16.67 p1 33.33 p2 50 mC66.67 p3 83.33 p4 100 0Z
 *   bottom  the same mirrored from y = 100
 * Why two: one 0-to-0 cubic is t(1-t)·linear, so it has a single peak and can
 * never draw worried's knitted-brow notch at the centre. Every pose uses this
 * same form, so any two poses blend number by number (GSAP attr tween,
 * ferni:lid-blend) and never snap. The x controls are evenly spaced, so x is
 * linear in t on each half: that makes the old `Q 50,k` domes exact here
 * (each is the quadratic split at x = 50), and so is main's two-Q worried. A
 * single-cubic pose (CONCEPTS' `C33 a 67 b`) is exact too, split at t = .5.
 *
 * A curve is five pulls, left to right: how far each control point (and the
 * join, `centre`) sits in from the cap's edge, in viewBox units. Symmetric
 * poses are written as a depth, % of the head diameter (old `Q 50,k` top =
 * depth k/2). A negative pull bows the cap outside the head, where it is
 * clipped away.
 */

/** Pulls in from the cap's edge: left half's two controls, the join at x = 50, right half's two. */
export type DomeCurve = readonly [
  leftOuter: number,
  leftInner: number,
  centre: number,
  rightInner: number,
  rightOuter: number,
];

export interface DomePose {
  top: DomeCurve;
  bottom: DomeCurve;
  /** Cheek dimple opacity, 0–1, for warm expressions. */
  dimpleOpacity: number;
  sparkle: boolean;
}

/** Evenly spaced x for the two halves (100/6 steps at two decimals: within 0.004 of exact). */
const CONTROL_X = ['16.67', '33.33', '66.67', '83.33'] as const;
/** Domes stop at least 7/100 of the diameter short of the eye top (eyes start at 36). */
export const MAX_DOME_DEPTH = 29;

function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function domePath(edgeY: number, direction: 1 | -1, curve: DomeCurve): string {
  const [p1, p2, m, p3, p4] = curve.map((pull) => formatNumber(edgeY + direction * pull));
  const [x1, x2, x3, x4] = CONTROL_X;
  return `M0 ${edgeY}C${x1} ${p1} ${x2} ${p2} 50 ${m}C${x3} ${p3} ${x4} ${p4} 100 ${edgeY}Z`;
}

export function topDomePath(curve: DomeCurve): string {
  return domePath(0, 1, curve);
}

export function bottomDomePath(curve: DomeCurve): string {
  return domePath(100, -1, curve);
}

export interface DomePaths {
  top: string;
  bottom: string;
}

export function domePaths(pose: Pick<DomePose, 'top' | 'bottom'>): DomePaths {
  return { top: topDomePath(pose.top), bottom: bottomDomePath(pose.bottom) };
}

/**
 * Two quadratic halves, `Q 25,left 50,centre` and `Q 75,right 100,0`, as cubics
 * (each control moves 2/3 of the way from its end point toward the Q control).
 */
export function quadraticHalves(left: number, centre: number, right: number): DomeCurve {
  const third = (from: number, to: number): number => from + ((to - from) * 2) / 3;
  return [third(0, left), third(centre, left), centre, third(centre, right), third(0, right)];
}

/** The old symmetric `Q 50,k` dome of this depth (k = 2 × depth), split at the centre. */
function dome(depth: number): DomeCurve {
  return quadraticHalves(depth, depth, depth);
}

/** Both eyes alike, top and bottom given as depths. */
function even(top: number, bottom: number, dimpleOpacity = 0, sparkle = false): DomePose {
  return { top: dome(top), bottom: dome(bottom), dimpleOpacity, sparkle };
}

/**
 * Brand-aligned emotional range, one entry per EmotionalExpression (ferni-expressions
 * binds it to that type, so a missing pose fails typecheck). Every shape is unchanged
 * from the `Q 50,k` table it replaces, worried's two Qs included; skeptical's two Qs
 * met at x = 60, so it is the closest smooth fit (max error 0.4 viewBox units).
 */
export const DOME_POSES = {
  neutral: even(-5, -5),
  happy: even(12.5, 7.5, 0.8), // Squinted eyes + dimples
  delighted: even(14, 9, 1, true), // Happy + full dimples + warmth sparkle
  surprised: even(-9, -9), // Wide open - present and attentive
  curious: even(7.5, 0), // Tilted - genuinely interested, not performative
  skeptical: {
    top: [10.7, 15.3, 8.9, 2.5, -5.8],
    bottom: dome(0),
    dimpleOpacity: 0,
    sparkle: false,
  }, // Asymmetric lid - direct but caring
  worried: {
    top: quadraticHalves(25, 15, 25),
    bottom: dome(2.5),
    dimpleOpacity: 0,
    sparkle: false,
  }, // Knitted brow - genuine concern
  sad: even(17.5, 0), // Droopy - empathetic presence
  sleepy: even(27.5, 15), // Heavy lids - winding down
  thinking: even(6, 2.5), // Slight squint, looking up/away
  empathetic: even(10, 5, 0.4), // Soft, warm - "I hear you" with subtle dimples
  excited: even(-6, -6, 0.7, true), // Wide but GROUNDED + dimples
  contemplative: even(9, 4), // Deep thought - wise, measured
  noticing: even(4, 0), // Picking up on something subtle - perceptive
  holdingSpace: even(11, 6), // Emotional containment - present, grounded
  // Listening states
  attentive: even(2.5, -2.5), // Active, engaged listening - user is speaking
  absorbing: even(10, 4), // Taking in heavy content - deep, slow breathing
  receiving: even(9, 5), // Open, accepting vulnerability - soft and safe
  curiousLean: even(5, -1), // Leaning in with interest
  // Warmth gradient
  warm: even(6, 2.5, 0.5), // Baseline positive regard - soft, open, subtle dimples
  pleased: even(9, 5, 0.6), // Mild satisfaction - subtle smile shape with dimples
  proud: even(11, 6, 0.8, true), // Pride in user - warm, beaming with proud dimples
  celebrating: even(13, 8, 1, true), // Full celebration - joyful, bright, full dimples
  // Presence states
  present: even(5, 1), // Fully here, grounded - open and steady
  holding: even(10, 5), // Containing emotion - steady, supportive
  accompanying: even(9, 4), // Walking alongside - empathetic presence
  waiting: even(7.5, 2.5), // Patient anticipation - soft, open
  // Coaching emotions
  encouraging: even(7.5, 4, 0.4), // Gentle support - warm, uplifting with hint of dimples
  challenging: even(5, 1), // Loving push - direct but caring
  reflecting: even(7, 2.5), // Mirroring back - thoughtful, measured
  recognizing: even(9, 5, 0.6, true), // "I see you" moment - warm, knowing with dimples
  // Relational moments
  remembering: even(8, 3, 0.5), // Callback moment - nostalgic, warm smile
  reconnecting: even(10, 6, 0.7, true), // "Welcome back" energy - warm, genuine dimples
  insider: even(11, 7, 0.6), // Shared history moment - playful, knowing dimples
  growing: even(10, 6, 0.8, true), // Noticing evolution - proud, warm with proud dimples
  // Transition states
  processing: even(9, 3), // Taking it in - slightly closed, contemplative
  realizing: even(-4, -4), // Connecting dots - widening with understanding
  shifting: even(4, 0), // Changing gears - neutral transition
  settling: even(7, 2), // Coming to rest - soft, peaceful
  farewell: even(11, 6, 0.6, true), // Warm goodbye - gentle smile, slight melancholy
} as const satisfies Readonly<Record<string, DomePose>>;

/** Neutral domes, used until an expression has been set. */
export const NEUTRAL_DOME_PATHS: DomePaths = domePaths(DOME_POSES.neutral);
