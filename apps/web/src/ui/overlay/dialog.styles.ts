/**
 * Dialog styles: rem on the 8-pt grid, sizes sm 25rem / md 30rem / lg 40rem,
 * radius 1.5rem, sheet detents on phones. Shared content classes
 * (__title, __message, __actions, __button) keep alerts consistent.
 *
 * @module ui/overlay/dialog.styles
 */

import { DURATION, EASING } from '../../config/animation-constants.js';

const STYLE_ID = 'ferni-dialog-styles';
const T = `${DURATION.NORMAL}ms ${EASING.DECELERATE}`;

const CSS = `
html.ferni-scroll-locked { overflow: hidden; }
.ferni-dialog {
  display: flex; flex-direction: column; margin: auto; padding: 0; border: 0;
  max-width: calc(100% - 2rem); max-height: min(90dvh, 45rem); overflow: hidden;
  border-radius: 1.5rem; background: var(--color-background-elevated); color: var(--color-text-primary);
  box-shadow: var(--shadow-xl); font-family: var(--font-body);
  transition: opacity ${T}, transform ${T}, overlay ${T} allow-discrete, display ${T} allow-discrete;
}
.ferni-dialog:not([open]) { display: none; }
.ferni-dialog::backdrop { background: var(--backdrop-medium, rgba(20, 16, 14, 0.6)); transition: opacity ${T}; }
@starting-style {
  .ferni-dialog[open] { opacity: 0; transform: translateY(0.5rem) scale(0.98); }
  .ferni-dialog[open]::backdrop { opacity: 0; }
}
.ferni-dialog--closing { opacity: 0; transform: translateY(0.5rem) scale(0.98); }
.ferni-dialog--closing::backdrop { opacity: 0; }
.ferni-dialog--sm { width: 25rem; }
.ferni-dialog--md { width: 30rem; }
.ferni-dialog--lg { width: 40rem; }
.ferni-dialog__surface { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 1.5rem; }
.ferni-dialog--lg .ferni-dialog__surface { padding: 2rem; }

/* Phones: md/lg present as a bottom sheet. */
.ferni-dialog--sheet {
  width: 100%; max-width: 100%; margin: auto 0 0; border-radius: 1.5rem 1.5rem 0 0;
  max-height: 50dvh; padding-bottom: env(safe-area-inset-bottom);
  transform: translateY(var(--ferni-sheet-drag, 0));
}
.ferni-dialog--sheet[data-detent='large'] {
  height: calc(100dvh - max(env(safe-area-inset-top), 0.5rem) - 0.5rem); max-height: none;
}
.ferni-dialog--sheet .ferni-dialog__surface { padding: 0.5rem 1rem 1rem; }
@starting-style { .ferni-dialog--sheet[open] { transform: translateY(100%); } }
.ferni-dialog--sheet.ferni-dialog--closing { transform: translateY(100%); opacity: 1; }
.ferni-dialog__grabber {
  flex: none; display: grid; place-items: center; height: 1.5rem; touch-action: none; cursor: grab;
}
.ferni-dialog__grabber::after {
  content: ''; width: 2.25rem; height: 0.3125rem; border-radius: var(--radius-full);
  background: var(--color-border-medium);
}

/* Shared alert content */
.ferni-dialog__icon {
  display: grid; place-items: center; width: 3rem; height: 3rem; margin: 0 auto 1rem;
  border-radius: var(--radius-full); color: var(--ferni-dialog-accent, var(--color-accent-primary));
  background: var(--color-background-secondary);
}
.ferni-dialog__icon svg { width: 1.5rem; height: 1.5rem; }
.ferni-dialog__icon--destructive { --ferni-dialog-accent: var(--color-semantic-error); }
.ferni-dialog__icon--warning { --ferni-dialog-accent: var(--color-semantic-warning); }
.ferni-dialog__title { margin: 0; font-size: 1.25rem; font-weight: 600; line-height: 1.3; text-align: center; }
.ferni-dialog__message {
  margin: 0.5rem 0 0; color: var(--color-text-secondary); font-size: 0.9375rem; line-height: 1.5; text-align: center;
}
.ferni-dialog__actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 1.5rem; }
.ferni-dialog__button {
  min-height: 2.75rem; padding: 0 1rem; border: 1px solid transparent; border-radius: var(--radius-full);
  font: inherit; font-size: 0.9375rem; font-weight: 600; cursor: pointer;
  background: var(--color-background-secondary); color: var(--color-text-primary);
}
.ferni-dialog__button--primary { background: var(--color-accent-primary); color: var(--color-text-inverse); }
.ferni-dialog__button--destructive {
  background: transparent; border-color: var(--color-semantic-error); color: var(--color-semantic-error);
}
.ferni-dialog__button:hover,
.ferni-dialog__button:focus-visible { filter: brightness(0.96); }
.ferni-dialog__button:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) {
  .ferni-dialog,
  .ferni-dialog--closing,
  .ferni-dialog--sheet.ferni-dialog--closing { transform: none; }
  @starting-style {
    .ferni-dialog[open],
    .ferni-dialog--sheet[open] { transform: none; }
  }
}
`;

export function injectDialogStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
