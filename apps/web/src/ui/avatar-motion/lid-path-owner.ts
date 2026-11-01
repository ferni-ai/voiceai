/**
 * One writer of the lid paths at a time.
 *
 * An expression tweens the lid `d` attributes (ferni-expressions). While the
 * voice (ferni:lid-blend) writes them every frame, the voice owns them: the
 * expression's path tweens in flight are stopped and no new ones start until
 * the voice hands them back, so each frame sets each lid `d` exactly once.
 * The tweens are killed by handle: `killTweensOf(lids, 'd')` and `'attr'` both
 * leave an `attr: { d }` tween running.
 */

import { gsap } from '../../utils/gsap-setup.js';

export interface LidPathMotion {
  durationS: number;
  ease: string;
  atS: number;
}

let voiceOwnsLidPaths = false;
let lidPathTweens: gsap.core.Tween[] = [];

/** Tween both lids to `paths` inside `timeline`, unless the voice owns them. */
export function tweenLidPaths(
  timeline: gsap.core.Timeline,
  lidTop: SVGPathElement,
  lidBottom: SVGPathElement,
  paths: { top: string; bottom: string },
  motion: LidPathMotion
): void {
  // While the voice owns the lids it eases to the expression's shape itself
  lidPathTweens = voiceOwnsLidPaths
    ? []
    : [
        gsap.to(lidTop, { attr: { d: paths.top }, duration: motion.durationS, ease: motion.ease }),
        gsap.to(lidBottom, { attr: { d: paths.bottom }, duration: motion.durationS, ease: motion.ease }),
      ];
  for (const tween of lidPathTweens) timeline.add(tween, motion.atS);
}

/** The voice takes over the lid paths: stop the expression's path tweens in flight. */
export function handLidPathsToVoice(): void {
  if (voiceOwnsLidPaths) return;
  voiceOwnsLidPaths = true;
  for (const tween of lidPathTweens) tween.kill();
  lidPathTweens = [];
}

/** Speech ended: expressions animate the lid paths again. */
export function takeLidPathsBack(): void {
  voiceOwnsLidPaths = false;
}

export function resetLidPathOwner(): void {
  voiceOwnsLidPaths = false;
  lidPathTweens = [];
}
