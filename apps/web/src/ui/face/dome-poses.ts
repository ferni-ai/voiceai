/**
 * Dome poses: the white caps over the head's top and bottom edge that carry
 * Ferni's expression (ivory #E6DFD4 in midnight, never the page colour).
 *
 * Every dome is one cubic curve in the overlay's 100×100 viewBox:
 *   top     M0 0C33.33 a 66.67 b 100 0Z
 *   bottom  M0 100C33.33 c 66.67 d 100 100Z
 * One shape for every pose means any two poses blend number by number (GSAP
 * attr tween, ferni:lid-blend) and never snap. The x controls sit at 100/3
 * and 200/3, which makes x(t) = 100t: that is the exact cubic form of the old
 * `Q 50,k` domes, so the approved shapes are unchanged.
 *
 * Poses store a depth per eye, as a % of the head diameter: [left, right].
 * With both eyes equal it is the dome's depth at the centre (old `Q 50,k`
 * top = depth k/2). Each eye's value sets the control point over that eye, so
 * the left and right halves of a dome can differ (skeptical today, wink later).
 * A negative depth bows the cap outside the head, where it is clipped away.
 */

/** Depth per eye, % of the head diameter. */
export type EyeDepths = readonly [left: number, right: number];

export interface DomePose {
  top: EyeDepths;
  bottom: EyeDepths;
  /** Cheek dimple opacity, 0–1, for warm expressions. */
  dimpleOpacity: number;
  sparkle: boolean;
}

/** A cubic with both controls at y = c peaks at 0.75c, so control = depth × 4/3. */
const DEPTH_TO_CONTROL = 4 / 3;
/** Exact Q→C x controls (100/3, 200/3) at two decimals: within 0.002 of the old curve. */
const CONTROL_X_LEFT = '33.33';
const CONTROL_X_RIGHT = '66.67';
/** Domes stop at least 7/100 of the diameter short of the eye top (eyes start at 36). */
export const MAX_DOME_DEPTH = 29;

function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function topDomePath([left, right]: EyeDepths): string {
  const a = formatNumber(left * DEPTH_TO_CONTROL);
  const b = formatNumber(right * DEPTH_TO_CONTROL);
  return `M0 0C${CONTROL_X_LEFT} ${a} ${CONTROL_X_RIGHT} ${b} 100 0Z`;
}

export function bottomDomePath([left, right]: EyeDepths): string {
  const c = formatNumber(100 - left * DEPTH_TO_CONTROL);
  const d = formatNumber(100 - right * DEPTH_TO_CONTROL);
  return `M0 100C${CONTROL_X_LEFT} ${c} ${CONTROL_X_RIGHT} ${d} 100 100Z`;
}

export interface DomePaths {
  top: string;
  bottom: string;
}

export function domePaths(pose: Pick<DomePose, 'top' | 'bottom'>): DomePaths {
  return { top: topDomePath(pose.top), bottom: bottomDomePath(pose.bottom) };
}

/** Both eyes at the same depth. */
function even(top: number, bottom: number, dimpleOpacity = 0, sparkle = false): DomePose {
  return { top: [top, top], bottom: [bottom, bottom], dimpleOpacity, sparkle };
}

/**
 * Brand-aligned emotional range, one entry per EmotionalExpression (ferni-expressions
 * binds it to that type, so a missing pose fails typecheck). Depths are unchanged from
 * the `Q 50,k` table they replace; skeptical and worried were two-segment paths and
 * are now the closest single cubic (max error 1.2 and 3 viewBox units).
 */
export const DOME_POSES = {
  neutral: even(-5, -5),
  happy: even(12.5, 7.5, 0.8), // Squinted eyes + dimples
  delighted: even(14, 9, 1, true), // Happy + full dimples + warmth sparkle
  surprised: even(-9, -9), // Wide open - present and attentive
  curious: even(7.5, 0), // Tilted - genuinely interested, not performative
  skeptical: { top: [21.75, -6], bottom: [0, 0], dimpleOpacity: 0, sparkle: false }, // Left lid lowered - direct but caring
  worried: even(18, 2.5), // Heavy lids - genuine concern
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
