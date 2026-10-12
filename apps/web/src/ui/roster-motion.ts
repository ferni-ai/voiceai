/**
 * FLIP motion for the team bar (stable roster only).
 *
 * The bar is rebuilt from scratch when the roster changes. Before the rebuild
 * we record where each avatar was; after it, each avatar that moved slides from
 * its old place to its new one (transform only), and a teammate who went from
 * "+" to a full avatar settles into their slot with a small spring. With
 * prefers-reduced-motion nothing animates; the bar just shows the new state.
 */

import { DURATION, EASING } from '../config/animation-constants.js';

export interface RosterSlotLayout {
  left: number;
  top: number;
  addable: boolean;
}

const SLOT_SELECTOR = '[data-persona-id]';

export function captureRosterLayout(container: HTMLElement): Map<string, RosterSlotLayout> {
  const layout = new Map<string, RosterSlotLayout>();
  for (const el of container.querySelectorAll<HTMLElement>(SLOT_SELECTOR)) {
    const id = el.getAttribute('data-persona-id');
    if (!id) continue;
    const rect = el.getBoundingClientRect();
    layout.set(id, {
      left: rect.left,
      top: rect.top,
      addable: el.classList.contains('team-member--addable'),
    });
  }
  return layout;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function playRosterFlip(container: HTMLElement, before: Map<string, RosterSlotLayout>): void {
  if (prefersReducedMotion() || typeof HTMLElement.prototype.animate !== 'function') return;
  for (const el of container.querySelectorAll<HTMLElement>(SLOT_SELECTOR)) {
    const id = el.getAttribute('data-persona-id');
    const was = id ? before.get(id) : undefined;
    if (!was) continue;
    const now = el.getBoundingClientRect();
    const dx = Math.round(was.left - now.left);
    const dy = Math.round(was.top - now.top);
    const from = `translate(${dx}px, ${dy}px)`;
    if (was.addable && !el.classList.contains('team-member--addable')) {
      el.animate(
        [
          { transform: `${from} scale(0.86)`, opacity: 0.6 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: DURATION.SLOW, easing: EASING.SPRING }
      );
    } else if (dx !== 0 || dy !== 0) {
      el.animate([{ transform: from }, { transform: 'none' }], {
        duration: DURATION.NORMAL,
        easing: EASING.STANDARD,
      });
    }
  }
}
