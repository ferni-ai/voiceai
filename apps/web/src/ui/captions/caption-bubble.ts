/**
 * Bubble placement and motion for live captions (variant B, "Pixar"). Ferni
 * on the avatar's right, the caller on its left; where there's no room they
 * share one spot. Positions are written only on change (standard #5), in
 * #coach coordinates, so text never inherits the avatar's breathing transform.
 *
 * @module ui/captions/caption-bubble
 */

import { DURATION, EASING, safeAnimate } from '../../config/animation-constants.js';

export type BubbleMode = 'side' | 'below';

export type Box = Record<'left' | 'top' | 'right' | 'bottom', number>;

export interface BubblePlacement {
  mode: BubbleMode;
  left: number;
  top: number;
  maxWidth: number;
  /** The caller's bubble on the avatar's left, or null to share Ferni's spot. */
  caller: { right: number; maxWidth: number } | null;
}

const GAP = 12; // px between the avatar (or its row) and the tail tip
const EDGE = 16; // px kept clear of the screen edge
const MIN_SIDE = 224; // px: narrower than this beside the avatar reads cramped
const TAIL_Y = 12; // px from the bubble top to the tail

/** Crisp vector tail: fill plus a hairline on its two outer curves. */
export const TAIL_SVG =
  '<svg class="ferni-bubble__tail" viewBox="0 0 12 16" aria-hidden="true">' +
  '<path class="ferni-bubble__tail-fill" d="M12 0 C12 6 7 11 0 14 C6 14.5 9.5 13 12 11 Z"/>' +
  '<path class="ferni-bubble__tail-edge" d="M12 0.5 C12 6 7 11 0 14 C6 14.5 9.5 13 12 11"/>' +
  '</svg>';

/**
 * Where the bubble goes, in #coach coordinates. `row` is anything sharing
 * the avatar's row (name, AI pill), which the bubble must start after.
 */
export function bubblePlacement(coachWidth: number, avatar: Box, row: Box[]): BubblePlacement {
  const sharesRow = (b: Box): boolean => b.top < avatar.bottom && b.bottom > avatar.top;
  const left = Math.round(
    Math.max(avatar.right, ...row.filter(sharesRow).map((b) => b.right)) + GAP
  );
  const maxWidth = Math.floor(coachWidth - left - EDGE);
  const top = Math.round(avatar.top + (avatar.bottom - avatar.top) * 0.3 - TAIL_Y);
  const callerWidth = Math.floor(avatar.left - GAP - EDGE);
  const caller =
    callerWidth >= MIN_SIDE
      ? { right: Math.round(coachWidth - avatar.left + GAP), maxWidth: callerWidth }
      : null;
  return maxWidth >= MIN_SIDE
    ? { mode: 'side', left, top, maxWidth, caller }
    : { mode: 'below', left: 0, top: 0, maxWidth: Math.floor(coachWidth - 2 * EDGE), caller: null };
}

/** Measure and place the pair inside #coach; writes only on change. */
export function placeBubble(bubble: HTMLElement): void {
  const coach = bubble.parentElement;
  const avatar = coach?.querySelector('.avatar-container');
  if (!coach || !avatar) return;
  const origin = coach.getBoundingClientRect();
  const rel = (el: Element | null): Box[] => {
    const r = el?.getBoundingClientRect();
    if (!r || !r.width) return [];
    return [
      {
        left: r.left - origin.left,
        top: r.top - origin.top,
        right: r.right - origin.left,
        bottom: r.bottom - origin.top,
      },
    ];
  };
  const [avatarBox] = rel(avatar);
  if (!avatarBox) return;
  const row = [
    ...rel(coach.querySelector('#personaName')),
    ...rel(coach.querySelector('.ai-companion-label-row')),
  ];
  const p = bubblePlacement(origin.width, avatarBox, row);
  const next = `${p.mode} ${p.left} ${p.top} ${p.maxWidth} ${p.caller?.right ?? '-'}`;
  if (bubble.dataset.place === next) return;
  bubble.dataset.place = next;
  bubble.dataset.mode = p.mode;
  bubble.dataset.pair = p.caller ? 'apart' : 'shared';
  bubble.style.setProperty('--bubble-x', `${p.left}px`);
  bubble.style.setProperty('--bubble-y', `${p.top}px`);
  bubble.style.setProperty('--bubble-max', `${p.maxWidth}px`);
  bubble.style.setProperty('--caller-right', `${p.caller?.right ?? 0}px`);
  bubble.style.setProperty('--caller-max', `${p.caller?.maxWidth ?? p.maxWidth}px`);
}

/**
 * Grow out of the face: scale from the tail point with a little overshoot
 * and settle (transform and opacity only; safeAnimate keeps reduced motion
 * to a fade).
 */
export function popIn(bubble: HTMLElement): void {
  if (typeof bubble.animate !== 'function') return; // no WAAPI: show without motion
  safeAnimate(
    bubble,
    [
      { opacity: 0, transform: 'scale(0.4)', easing: EASING.SPRING },
      { opacity: 1, transform: 'scale(1)' },
    ],
    { duration: DURATION.DELIBERATE }
  );
}
