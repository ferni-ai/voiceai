/**
 * Which avatar motion may play right now, in one place.
 *
 * Two things stop motion:
 * - prefers-reduced-motion stops every kind below;
 * - the crisis face hold (ui/face/crisis-face-hold.ts) stops every kind except
 *   the calm blink and the protective lean. fe ruled on 2026-11-11 that a
 *   dead-still face reads as frozen or broken, which is worse for someone in
 *   crisis than calm motion, so during the hold Ferni still blinks at a calm
 *   pace, keeps his eyes steady on the caller and nods gently. Seth added on
 *   2026-11-12 that he may lean in once, slowly (protective-lean.ts).
 *
 * The sources that ask, each at its own call site right before it moves (so a
 * hold that starts mid-call stops them at the next frame or cue), are the ones
 * named under each kind below. This is not every animation on the page: other
 * motion has its own checks or none. New motion (the expressive eyes' lid and
 * brow motion, say) should pick the closest kind here or add one, not read the
 * hold itself.
 *
 * @module ui/avatar-motion/motion-allowed
 */

import { isCrisisFaceHeld } from '../face/crisis-face-hold.js';

export type AvatarMotionKind =
  /** A plain natural blink at a calm pace. Allowed while held. */
  | 'blink'
  /** Natural blink's doubles, blinks cued by turn changes, and the persona's quicker pace. */
  | 'blinkFlourish'
  /** The body settling after a natural blink. */
  | 'bodyDip'
  /**
   * Saccades, look-aways and following the pointer: the gaze switch's eyes and
   * the avatar soul's micro-saccades. Without it the eyes rest on the caller.
   */
  | 'gazeShift'
  /**
   * Looking away to think or recall: the gaze switch's thinking point, the
   * thinking glance, the contemplation micro-expression's glance and the
   * superhuman observation's glance.
   */
  | 'thinkingLook'
  /** Speech beats: head beats on stressed syllables. */
  | 'speechBeat'
  /** The speaking system's lids opening with the voice. */
  | 'lidVoice'
  /** Listen nods above the gentlest amplitude, and the spring body's nod kick. */
  | 'fullNod'
  /** A smile in answer to Ferni's own laugh, and the spring body's laugh kick. */
  | 'smile'
  /** The body moving with a turn change: turn gestures and the spring body's turn moves. */
  | 'bodyTurn'
  /** Protective mode's lean-in. Allowed while held, once and slowly (protective-lean.ts). */
  | 'drawCloser'
  /** Protective mode's comfort pulse: rings growing outward around the avatar. */
  | 'comfortPulse';

/** The kinds that still play while the crisis face is held. */
const CALM_DURING_HOLD: ReadonlySet<AvatarMotionKind> = new Set(['blink', 'drawCloser']);

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Whether `kind` of avatar motion may play now (see the module comment). */
export function avatarMotionAllowed(kind: AvatarMotionKind): boolean {
  if (prefersReducedMotion()) return false;
  return !isCrisisFaceHeld() || CALM_DURING_HOLD.has(kind);
}
