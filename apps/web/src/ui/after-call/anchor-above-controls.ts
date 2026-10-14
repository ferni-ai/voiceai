/**
 * Keeps the after-call and cost cards clear of the call controls.
 *
 * Both cards are fixed near the bottom of the screen, where the Connect button
 * also lives. Anchored here, a card sits just above the controls row, never
 * under the notch or the home indicator, and scrolls inside itself when the
 * room above the controls is short.
 *
 * @module ui/after-call/anchor-above-controls
 */

const CONTROLS_SELECTOR = '.controls-row';
/** Room between the card and the controls, in px. */
const GAP_PX = 16;
/** Where a card sits when there are no controls to measure (the old fixed spot). */
const FALLBACK_BOTTOM = '120px';
/** Set on the card: distance from the viewport bottom to just above the controls. */
const BOTTOM_VAR = '--call-card-bottom';

/**
 * CSS for a card anchored above the controls. The card's own rule should not
 * set `bottom` or `max-height`.
 */
export function anchoredCardCss(selector: string): string {
  const bottom = `max(var(${BOTTOM_VAR}, ${FALLBACK_BOTTOM}), calc(env(safe-area-inset-bottom, 0px) + var(--space-md)))`;
  return `
    ${selector} {
      bottom: ${bottom};
      max-height: calc(100dvh - ${bottom} - env(safe-area-inset-top, 0px) - var(--space-md));
      overflow-y: auto;
      overscroll-behavior: contain;
    }
  `;
}

/** Distance from the viewport bottom to just above the controls, or null when they aren't laid out. */
export function bottomAboveControls(): number | null {
  const controls = document.querySelector(CONTROLS_SELECTOR);
  if (!controls) return null;
  const rect = controls.getBoundingClientRect();
  if (rect.height === 0) return null;
  return Math.max(0, Math.round(window.innerHeight - rect.top + GAP_PX));
}

/**
 * Place the card above the controls now and whenever the viewport changes.
 * Returns the function that stops following the viewport.
 */
export function anchorAboveControls(card: HTMLElement): () => void {
  const place = (): void => {
    const bottom = bottomAboveControls();
    if (bottom === null) card.style.removeProperty(BOTTOM_VAR);
    else card.style.setProperty(BOTTOM_VAR, `${bottom}px`);
  };
  place();
  window.addEventListener('resize', place);
  return () => window.removeEventListener('resize', place);
}
