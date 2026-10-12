/**
 * Speech-bubble placement and motion for live captions (variant A).
 *
 * The bubble belongs to Ferni like a character's speech: anchored to the
 * avatar's right edge with a small tail pointing at it. Where the avatar
 * shares its row with the name (phone landscape) it starts after the row;
 * where there is no room beside the avatar (portrait phone) it sits in the
 * flow just under it, tail up. Positions are written only when they change
 * (animation standard #5), relative to #coach, so the bubble never inherits
 * the avatar's breathing transform and its text stays crisp.
 *
 * @module ui/captions/caption-bubble
 */

import { DURATION, EASING, safeAnimate } from '../../config/animation-constants.js';

export type BubbleMode = 'side' | 'below';

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface BubblePlacement {
  mode: BubbleMode;
  left: number;
  top: number;
  maxWidth: number;
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
  return maxWidth >= MIN_SIDE
    ? { mode: 'side', left, top, maxWidth }
    : { mode: 'below', left: 0, top: 0, maxWidth: Math.floor(coachWidth - 2 * EDGE) };
}

/** Measure and place `bubble` inside #coach; writes only on change. */
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
  const next = `${p.mode} ${p.left} ${p.top} ${p.maxWidth}`;
  if (bubble.dataset.place === next) return;
  bubble.dataset.place = next;
  bubble.dataset.mode = p.mode;
  bubble.style.setProperty('--bubble-x', `${p.left}px`);
  bubble.style.setProperty('--bubble-y', `${p.top}px`);
  bubble.style.setProperty('--bubble-max', `${p.maxWidth}px`);
}

/** Pop in from the tail: a small spring on transform and opacity only. */
export function popIn(bubble: HTMLElement): void {
  if (typeof bubble.animate !== 'function') return; // no WAAPI: show without motion
  safeAnimate(
    bubble,
    [
      { opacity: 0, transform: 'scale(0.92)' },
      { opacity: 1, transform: 'scale(1)' },
    ],
    { duration: DURATION.MODERATE, easing: EASING.SPRING_GENTLE }
  );
}

/**
 * Soft morph between utterances: the bubble's material layer eases from its
 * old size to its new one (FLIP on transform), while the text stays crisp.
 */
export function morph(bubble: HTMLElement, change: () => void): void {
  const bg = bubble.querySelector<HTMLElement>('.ferni-bubble__bg');
  const before = bubble.getBoundingClientRect();
  change();
  if (typeof bg?.animate !== 'function') return;
  const after = bubble.getBoundingClientRect();
  if (!bg || !before.width || !after.width) return;
  const sx = before.width / after.width;
  const sy = before.height / after.height;
  if (Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;
  safeAnimate(bg, [{ transform: `scale(${sx}, ${sy})` }, { transform: 'scale(1, 1)' }], {
    duration: DURATION.MODERATE,
    easing: EASING.SPRING_GENTLE,
  });
}
