/**
 * Full call transcript as a bottom sheet, opened from the live captions (like
 * expanding Live Captions, or a call transcript on iOS). A native modal
 * <dialog>: focus moves in and back out, Escape closes it, the page behind is
 * inert, and tapping the backdrop closes it too.
 *
 * @module ui/captions/transcript-sheet
 */

import { DURATION, EASING } from '../../config/animation-constants.js';
import { t } from '../../i18n/index.js';

const STYLE_ID = 'ferni-transcript-sheet-styles';

const CSS = `
.ferni-captions .ferni-captions__expand { position: absolute; top: 0; right: 0; }
.ferni-captions__viewport { cursor: pointer; }
.ferni-captions__expand,
.ferni-transcript-sheet__close {
  display: grid; place-items: center; width: 2.75rem; height: 2.75rem; padding: 0;
  border: 0; border-radius: var(--radius-full); background: transparent; cursor: pointer;
  color: var(--color-text-secondary);
}
.ferni-captions__expand svg,
.ferni-transcript-sheet__close svg { width: 1.25rem; height: 1.25rem; }
.ferni-captions__expand:hover,
.ferni-captions__expand:focus-visible,
.ferni-transcript-sheet__close:hover,
.ferni-transcript-sheet__close:focus-visible { background: var(--color-bg-elevated); color: var(--color-text-primary); }
.ferni-captions__expand:focus-visible,
.ferni-transcript-sheet__close:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
.ferni-transcript-sheet {
  position: fixed; inset: auto 0 0; margin: 0 auto; padding: 0; border: 0;
  width: min(40rem, 100%); max-width: 100%; max-height: 85dvh;
  border-radius: var(--radius-2xl) var(--radius-2xl) 0 0;
  background: var(--color-bg-elevated); color: var(--color-text-primary); box-shadow: var(--shadow-lg);
  display: flex; flex-direction: column;
}
.ferni-transcript-sheet:not([open]) { display: none; }
.ferni-transcript-sheet::backdrop { background: var(--color-bg-glass); }
.ferni-transcript-sheet[open] { animation: ferni-sheet-in ${DURATION.SLOW}ms ${EASING.DECELERATE}; }
@keyframes ferni-sheet-in { from { transform: translateY(100%); } }
.ferni-transcript-sheet__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-sm) var(--space-sm) var(--space-xs) var(--space-lg);
}
.ferni-transcript-sheet__title { margin: 0; font-size: var(--text-lg); font-weight: var(--font-weight-semibold); }
.ferni-transcript-sheet__list {
  margin: 0; overflow-y: auto; overscroll-behavior: contain; list-style: none;
  display: flex; flex-direction: column; gap: var(--space-md);
  padding: var(--space-sm) var(--space-lg) calc(var(--space-lg) + env(safe-area-inset-bottom, 0px));
  font-size: var(--text-base); line-height: var(--leading-relaxed);
}
.ferni-transcript-sheet__list .ferni-caption-line__name { display: flex; margin-bottom: var(--space-2xs); }
@media (prefers-reduced-motion: reduce) {
  .ferni-transcript-sheet[open] { animation: none; }
}
`;

/** Expand chevron for the live captions header (the caller sets aria-label). */
export const EXPAND_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 15 6-6 6 6"/></svg>';
const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

export function injectTranscriptSheetStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

let sheet: HTMLDialogElement | null = null;

function build(): HTMLDialogElement {
  injectTranscriptSheetStyles();
  document.querySelectorAll('.ferni-transcript-sheet').forEach((el) => el.remove()); // HMR
  const dialog = document.createElement('dialog');
  dialog.className = 'ferni-transcript-sheet';
  dialog.setAttribute('aria-labelledby', 'ferni-transcript-sheet-title');
  const header = document.createElement('header');
  header.className = 'ferni-transcript-sheet__header';
  const title = document.createElement('h2');
  title.id = 'ferni-transcript-sheet-title';
  title.className = 'ferni-transcript-sheet__title';
  title.textContent = t('transcript.sheetTitle');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'ferni-transcript-sheet__close';
  close.setAttribute('aria-label', t('transcript.close'));
  close.innerHTML = CLOSE_ICON;
  close.addEventListener('click', () => dialog.close());
  header.append(title, close);
  const list = document.createElement('ol');
  list.className = 'ferni-transcript-sheet__list';
  dialog.append(header, list);
  // A click whose target is the dialog itself landed on the backdrop.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  return dialog;
}

/**
 * Open (or refresh) the sheet with every utterance so far, newest in view.
 * Generic over the entry type so this module does not import live-captions
 * (which imports it): the caller passes its entries and how to draw one.
 */
export function openTranscriptSheet<T>(
  entries: readonly T[],
  render: (entry: T) => HTMLElement
): void {
  if (!sheet?.isConnected) sheet = build();
  const list = sheet.querySelector('ol');
  list?.replaceChildren(
    ...entries.map((entry) => {
      const item = document.createElement('li');
      item.append(render(entry));
      return item;
    })
  );
  if (!sheet.open) sheet.showModal();
  if (list) list.scrollTop = list.scrollHeight;
}
