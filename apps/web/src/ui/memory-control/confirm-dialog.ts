/**
 * Accessible confirm dialog for destructive memory actions.
 *
 * - role="alertdialog", labelled and described
 * - Focus moves in (to Cancel, or to the typed-confirmation field) and back
 *   to whatever had it when the dialog closes
 * - Tab stays inside; Escape cancels without closing the panel behind it
 * - Optional typed confirmation: the confirm button stays disabled until the
 *   exact phrase is typed
 *
 * @module ui/memory-control/confirm-dialog
 */

import { t } from '../../i18n/index.js';
import { esc } from './format.js';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  /** When set, the user must type this exact text to enable confirm. */
  typedConfirmation?: string;
}

let dialogCount = 0;

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** Keep Tab focus inside a container whose content can change. */
export function keepFocusInside(container: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
  if (items.length === 0) {
    event.preventDefault();
    return;
  }
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !container.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Ask the user to confirm. Resolves true on confirm, false on cancel/Escape.
 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  const previousFocus = document.activeElement as HTMLElement | null;
  const id = `memory-confirm-${++dialogCount}`;
  const phrase = options.typedConfirmation;

  const root = document.createElement('div');
  root.className = 'memory-confirm';
  root.innerHTML = `
    <div class="memory-confirm__backdrop" data-confirm-cancel></div>
    <div class="memory-confirm__card" role="alertdialog" aria-modal="true"
      aria-labelledby="${id}-title" aria-describedby="${id}-message">
      <h3 class="memory-confirm__title" id="${id}-title">${esc(options.title)}</h3>
      <p class="memory-confirm__message" id="${id}-message">${esc(options.message)}</p>
      ${
        phrase
          ? `<label class="memory-confirm__label" for="${id}-input">${esc(
              t('memoryControl.typeToConfirm', 'Type {phrase} to confirm', { phrase })
            )}</label>
        <input class="memory-confirm__input" id="${id}-input" type="text"
          autocomplete="off" autocapitalize="characters" spellcheck="false" />`
          : ''
      }
      <div class="memory-confirm__actions">
        <button type="button" class="memory-btn memory-btn--quiet" data-confirm-cancel>${esc(
          t('memoryControl.cancel', 'Cancel')
        )}</button>
        <button type="button" class="memory-btn memory-btn--danger" data-confirm-ok ${
          phrase ? 'disabled' : ''
        }>${esc(options.confirmLabel)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const card = root.querySelector<HTMLElement>('.memory-confirm__card')!;
  const okButton = root.querySelector<HTMLButtonElement>('[data-confirm-ok]')!;
  const input = root.querySelector<HTMLInputElement>('.memory-confirm__input');

  return new Promise<boolean>((resolve) => {
    const finish = (confirmed: boolean): void => {
      root.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(confirmed);
    };

    root
      .querySelectorAll('[data-confirm-cancel]')
      .forEach((el) => el.addEventListener('click', () => finish(false)));
    okButton.addEventListener('click', () => {
      if (!okButton.disabled) finish(true);
    });
    input?.addEventListener('input', () => {
      okButton.disabled = input.value.trim() !== phrase;
    });
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !okButton.disabled) {
        e.preventDefault();
        finish(true);
      }
    });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // Close only this dialog, not the panel underneath
        e.stopPropagation();
        e.preventDefault();
        finish(false);
        return;
      }
      keepFocusInside(card, e);
    });

    (input ?? root.querySelector<HTMLButtonElement>('[data-confirm-cancel].memory-btn'))?.focus();
  });
}
