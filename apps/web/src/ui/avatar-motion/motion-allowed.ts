/**
 * Which avatar motion may play right now, in one place.
 *
 * Two things stop motion:
 * - prefers-reduced-motion stops every kind below;
 * - the crisis face hold (ui/face/crisis-face-hold.ts) stops every kind except
 *   the calm blink. fe ruled on 2026-11-11 that a dead-still face reads as
 *   frozen or broken, which is worse for someone in crisis than calm motion,
 *   so during the hold Ferni still blinks at a calm pace, keeps his eyes
 *   steady on the caller and nods gently, and nothing else moves.
 *
 * Each motion source asks `avatarMotionAllowed(kind)` at its own call site,
 * right before it moves, so a hold that starts mid-call stops it at the next
 * frame or cue. New motion (the expressive eyes' lid and brow motion, say)
 * should pick the closest kind here or add one, not read the hold itself.
 *
 * @module ui/avatar-motion/motion-allowed
 */

import { isCrisisFaceHeld } from '../face/crisis-face-hold.js';

export type AvatarMotionKind =
  /** A plain blink at a calm pace. The only kind the crisis hold allows. */
  | 'blink'
  /** Double blinks, blinks cued by turn changes, and the persona's quicker blink pace. */
  | 'blinkFlourish'
  /** The body settling after a blink. */
  | 'bodyDip'
  /** Saccades, look-aways and following the pointer. Without it the eyes rest on the caller. */
  | 'gazeShift'
  /** The thinking gaze point and the thinking glance. */
  | 'thinkingLook'
  /** Head beats on stressed syllables. */
  | 'speechBeat'
  /** The lids opening with the voice. */
  | 'lidVoice'
  /** Nods above the gentlest amplitude, and the body kick that goes with them. */
  | 'fullNod'
  /** A smile in answer to Ferni's own laugh. */
  | 'smile';

/** The kinds that still play while the crisis face is held. */
const CALM_DURING_HOLD: ReadonlySet<AvatarMotionKind> = new Set(['blink']);

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
