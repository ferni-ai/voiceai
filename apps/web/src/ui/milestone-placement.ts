/**
 * Milestone placement: when and where a milestone celebration card may appear.
 *
 * The first-call card ("the beginning of something good") used to land at the
 * moment a call connected, on top of the "Ferni joined" pill, a badge and the
 * sidekick icons, and over the Disconnect and mute buttons. Celebrations now
 * wait until the call's opening has settled and nobody is speaking, and the
 * card is placed above the call controls so it never covers them.
 */

import { appState } from '../state/app.state.js';

/** How long after a call connects before a celebration may appear. */
export const OPENING_SETTLE_MS = 20_000;

/** How long to wait before trying again while Ferni is speaking. */
export const SPEAKING_RETRY_MS = 3_000;

/** Space between the card and the top of the call controls. */
const CONTROLS_GAP_PX = 12;

/** Space kept between the card and the edge of the viewport. */
const VIEWPORT_EDGE_PX = 8;

/** The top of the waveform and buttons; the card sits above whichever is higher. */
const CALL_CONTROL_SELECTORS = ['#waveformContainer', '.controls-row'];

let connectedAt: number | null = null;

/** Record connection changes, so the hold can count from when the call connected. */
export function noteConnectionState(state: unknown, now = Date.now()): void {
  connectedAt = state === 'connected' ? now : null;
}

/** Milliseconds to wait before a celebration may show; 0 when it can show now. */
export function celebrationHoldMs(now = Date.now()): number {
  if (appState.get('connection') !== 'connected') return 0;
  const settleMs = connectedAt === null ? 0 : connectedAt + OPENING_SETTLE_MS - now;
  if (settleMs > 0) return settleMs;
  return appState.get('audio') === 'speaking' ? SPEAKING_RETRY_MS : 0;
}

/** Top edge (px from the viewport top) of the visible call controls, or null when none show. */
function topOfCallControls(): number | null {
  let top: number | null = null;
  for (const selector of CALL_CONTROL_SELECTORS) {
    const element = document.querySelector(selector);
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    if (rect.height === 0 || rect.top >= window.innerHeight) continue;
    top = top === null ? rect.top : Math.min(top, rect.top);
  }
  return top;
}

/**
 * Add the card to the page above the call controls. When there is no room above
 * them it goes to the top of the viewport instead; it never covers the controls.
 * With no controls on screen the stylesheet's default position applies.
 */
export function placeMilestoneCard(card: HTMLElement): void {
  document.body.appendChild(card);
  const controlsTop = topOfCallControls();
  if (controlsTop === null) return;

  const bottom = window.innerHeight - controlsTop + CONTROLS_GAP_PX;
  const height = card.getBoundingClientRect().height;
  if (bottom + height <= window.innerHeight - VIEWPORT_EDGE_PX) {
    card.style.bottom = `${bottom}px`;
    return;
  }
  card.style.top = `${VIEWPORT_EDGE_PX}px`;
  card.style.bottom = 'auto';
}
