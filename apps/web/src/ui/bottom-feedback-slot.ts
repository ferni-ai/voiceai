/**
 * One bottom-centre slot for the in-call feedback pills.
 *
 * The contextual "how is this landing?" pill and the "Was this memory
 * helpful?" pill both sit centred just above the bottom safe area, below the
 * call controls. Only one is ever on screen: a second pill waits its turn
 * instead of stacking on the first. "Tap to hear Ferni" outranks both, so
 * while it is showing every pill waits.
 *
 * @module ui/bottom-feedback-slot
 */

import { DURATION } from '../config/animation-constants.js';

export interface SlotClaim {
  /** One per pill kind. A new claim with the same id replaces a waiting one. */
  id: string;
  /** Put the pill on screen. Called when the slot is granted. */
  show: () => void;
}

/** Where a pill sits: centred, just above the bottom safe area. */
export const SLOT_BOTTOM = 'calc(env(safe-area-inset-bottom, 0px) + var(--space-lg))';
/** Phones (<= 480px): only the menu button is down there, at the left edge. */
export const SLOT_BOTTOM_PHONE = 'calc(env(safe-area-inset-bottom, 0px) + var(--space-md))';

/** While this is on screen the pills wait (ui/tap-to-hear.ui.ts). */
export const PRIORITY_SELECTOR = '.tap-to-hear:not([hidden])';

let holder: string | null = null;
/** The last pill is still fading out; the next one waits for it. */
let leavingTimer: ReturnType<typeof setTimeout> | null = null;
const waiting: SlotClaim[] = [];
let priorityWatch: MutationObserver | null = null;

function priorityShowing(): boolean {
  return document.querySelector(PRIORITY_SELECTOR) !== null;
}

function stopWatchingPriority(): void {
  priorityWatch?.disconnect();
  priorityWatch = null;
}

/** Re-try the queue once the priority element hides or leaves the page. */
function watchPriority(): void {
  if (priorityWatch) return;
  priorityWatch = new MutationObserver(() => {
    if (!priorityShowing()) grantNext();
  });
  priorityWatch.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['hidden', 'class'],
  });
}

function grantNext(): void {
  if (leavingTimer) return;
  if (holder !== null || waiting.length === 0) {
    stopWatchingPriority();
    return;
  }
  if (priorityShowing()) {
    watchPriority();
    return;
  }
  stopWatchingPriority();
  const next = waiting.shift()!;
  holder = next.id;
  next.show();
}

function dropWaiting(id: string): void {
  const index = waiting.findIndex((claim) => claim.id === id);
  if (index >= 0) waiting.splice(index, 1);
}

/**
 * Show the pill now if the slot is free, otherwise queue it. The current
 * holder claiming again re-shows in place (a newer prompt of the same kind).
 */
export function claimBottomSlot(claim: SlotClaim): void {
  if (holder === claim.id) {
    claim.show();
    return;
  }
  dropWaiting(claim.id);
  waiting.push(claim);
  grantNext();
}

/** The pill left the screen, or gave up waiting: hand the slot to the next one. */
export function releaseBottomSlot(id: string): void {
  dropWaiting(id);
  if (holder !== id) return;
  holder = null;
  // Both pills fade out over DURATION.NORMAL; never cross-fade two of them.
  leavingTimer = setTimeout(() => {
    leavingTimer = null;
    grantNext();
  }, DURATION.NORMAL);
}

/** Which pill holds the slot, if any. */
export function bottomSlotHolder(): string | null {
  return holder;
}

/** Forget every claim (tests and HMR). */
export function resetBottomSlot(): void {
  if (leavingTimer) clearTimeout(leavingTimer);
  leavingTimer = null;
  holder = null;
  waiting.length = 0;
  stopWatchingPriority();
}
