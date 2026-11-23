/**
 * Protective mode's lean: the avatar draws a little closer (scale 1.03) when it
 * senses distress, and eases back when protective mode ends.
 *
 * During the crisis face hold, Seth ruled (2026-11-12, via fe) that the lean is
 * the one body motion that may still play, because drawing closer to someone in
 * crisis reads as care. It plays as one slow, calm lean-in with no spring or
 * overshoot, at most once per hold, and stays until the hold ends (the call's
 * end, `releaseHeldLean`), then eases back. Reduced motion stops it, held or
 * not (motion-allowed.ts).
 *
 * @module ui/avatar-motion/protective-lean
 */

import { EASING } from '../../config/animation-constants.js';
import { gsap } from '../../utils/gsap-setup.js';
import { isCrisisFaceHeld } from '../face/crisis-face-hold.js';
import { avatarMotionAllowed } from './motion-allowed.js';

/** How much closer the avatar draws. */
export const LEAN_SCALE = 1.03;
/** The held lean, in seconds: slow enough to read as calm (Seth: at least ~800 ms). */
export const HELD_LEAN_S = 1.2;
/** A sine ease never passes its end value, so the held lean cannot overshoot. */
const HELD_LEAN_EASE = 'sine.inOut';

/** The container leaned in during this hold; it eases back when the hold ends. */
let heldLean: Element | null = null;
/** Whether this hold already had its one lean, so a second concern gets none. */
let leanedThisHold = false;

/** Protective mode began: lean in, unless motion is stopped or this hold already leaned. */
export function leanCloser(container: Element): void {
  if (!avatarMotionAllowed('drawCloser')) return;
  if (!isCrisisFaceHeld()) {
    gsap.to(container, { scale: LEAN_SCALE, duration: 0.6, ease: EASING.GENTLE });
    return;
  }
  if (leanedThisHold) return;
  leanedThisHold = true;
  heldLean = container;
  gsap.to(container, { scale: LEAN_SCALE, duration: HELD_LEAN_S, ease: HELD_LEAN_EASE });
}

/** Protective mode ended: lean back, except during the hold, which keeps the lean until it ends. */
export function leanBack(container: Element): void {
  if (isCrisisFaceHeld()) {
    heldLean = container; // a lean from before the hold eases back with it, too
    return;
  }
  gsap.to(container, { scale: 1, duration: 0.8, ease: EASING.GENTLE });
}

/** The hold ended with the call: ease a held lean back, and let the next hold lean once. */
export function releaseHeldLean(): void {
  leanedThisHold = false;
  const container = heldLean;
  heldLean = null;
  if (container) gsap.to(container, { scale: 1, duration: HELD_LEAN_S, ease: HELD_LEAN_EASE });
}
