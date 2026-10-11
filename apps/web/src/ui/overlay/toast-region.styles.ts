/**
 * Toast region styles. Spacing is rem on the 8-pt grid (4-pt half steps
 * inside the toast), so it scales with the reader's text size.
 *
 * @module ui/overlay/toast-region.styles
 */

import { DURATION, EASING } from '../../config/animation-constants.js';

const STYLE_ID = 'ferni-toast-region-styles';

const CSS = `
/* position/inset/margin/border reset the popover UA defaults. z-index only
   matters where the Popover API is missing; the top layer ignores it. */
.ferni-toast-region {
  position: fixed; inset: auto; margin: 0; padding: 0; border: 0;
  top: calc(max(env(safe-area-inset-top), 0.5rem) + 0.5rem); left: 1rem; right: 1rem; width: auto;
  background: transparent; overflow: visible; pointer-events: none; z-index: var(--z-notification);
}
@media (min-width: 769px) {
  /* Top-right, under the settings trigger (24 + 44 + 8 px). */
  .ferni-toast-region { top: 4.75rem; left: auto; right: 1.5rem; width: 22.5rem; }
}
.ferni-toast-region__list {
  display: flex; flex-direction: column; gap: 0.5rem; margin: 0; padding: 0; list-style: none;
}
.ferni-toast {
  --ferni-toast-accent: var(--color-semantic-info);
  display: flex; align-items: center; gap: 0.75rem; min-height: 3rem; padding: 0.75rem 1rem;
  border: 1px solid var(--color-border-subtle);
  border-inline-start: 0.25rem solid var(--ferni-toast-accent);
  border-radius: 0.75rem;
  background: var(--color-background-elevated);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-lg);
  font-family: var(--font-body); font-size: 0.9375rem; font-weight: 500; line-height: 1.4;
  pointer-events: auto;
  transition: opacity ${DURATION.NORMAL}ms ${EASING.DECELERATE},
    transform ${DURATION.NORMAL}ms ${EASING.DECELERATE};
}
.ferni-toast--success { --ferni-toast-accent: var(--color-semantic-success); }
.ferni-toast--warning { --ferni-toast-accent: var(--color-semantic-warning); }
.ferni-toast--error { --ferni-toast-accent: var(--color-semantic-error); }
.ferni-toast--entering,
.ferni-toast--leaving { opacity: 0; transform: translateY(-0.5rem); }
.ferni-toast__icon { flex: none; width: 1.25rem; height: 1.25rem; color: var(--ferni-toast-accent); }
.ferni-toast__message { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.ferni-toast__action {
  flex: none; min-height: 2.75rem; padding: 0 1rem; cursor: pointer;
  border: 1px solid var(--color-border-subtle); border-radius: var(--radius-full);
  background: transparent; color: var(--color-text-primary); font: inherit; font-weight: 600;
}
.ferni-toast__action:hover,
.ferni-toast__action:focus-visible { background: var(--color-background-secondary); }
.ferni-toast__action:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
.ferni-toast-live {
  position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  /* Fade only. Display time is never shortened (see toastDuration). */
  .ferni-toast { transition: opacity ${DURATION.NORMAL}ms linear; }
  .ferni-toast--entering,
  .ferni-toast--leaving { transform: none; }
}
`;

export function injectToastRegionStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
