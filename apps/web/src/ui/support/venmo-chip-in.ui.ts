/**
 * Venmo chip-in card: ask for a dollar, show the QR, never push.
 *
 * Same spirit as Support Ferni: "chip in", not "subscribe"; free is
 * celebrated; no pressure, no guilt, no urgency. We can't know whether a
 * payment happened, so the card never thanks anyone for one.
 *
 * A native <dialog> opened with showModal(): a centered card on desktop and a
 * bottom sheet on phones (<=768px). The QR image is optional; when
 * /support/venmo-qr.png is missing the QR block is removed and the handle and
 * link stay.
 *
 * @module ui/support/venmo-chip-in
 */

import { t } from '../../i18n/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('VenmoChipIn');

const DIALOG_CLASS = 'venmo-chip-in';
const STYLE_ID = 'venmo-chip-in-styles';
const TITLE_ID = 'venmo-chip-in-title';
export const VENMO_QR_SRC = '/support/venmo-qr.png';

const CLOSE_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

/** Opens the Venmo app on phones with $1 prefilled; the amount can be changed there. */
export function venmoPayUrl(handle: string): string {
  return `https://venmo.com/${encodeURIComponent(handle)}?txn=pay&amount=1&note=${encodeURIComponent('Ferni')}`;
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  const c = `.${DIALOG_CLASS}`;
  style.textContent = `
    ${c} { width: min(25rem, calc(100% - 2 * var(--space-md))); max-height: min(90dvh, 45rem);
      margin: auto; padding: calc(var(--space-md) * 1.5); border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-2xl); background: var(--color-bg-elevated); color: var(--color-text-primary);
      box-shadow: var(--shadow-lg); overflow-y: auto; }
    ${c}[open] { animation: venmo-chip-in-enter var(--duration-normal) var(--ease-out-expo); }
    ${c}::backdrop { background: var(--color-utility-backdrop-light); }
    ${c} .vci-close { position: absolute; top: var(--space-sm); right: var(--space-sm); width: 2.75rem;
      height: 2.75rem; display: grid; place-items: center; border: 0; border-radius: var(--radius-full);
      background: transparent; color: var(--color-text-muted); cursor: pointer; }
    ${c} .vci-close:hover, ${c} .vci-close:focus-visible { background: var(--color-tonal-surface2-background); }
    ${c} .vci-eyebrow { margin: 0 0 var(--space-xs); font-size: var(--text-sm); font-weight: var(--font-weight-semibold);
      color: var(--color-accent-text); }
    ${c} h2 { margin: 0 2.75rem var(--space-sm) 0; font-size: 1.25rem; font-weight: var(--font-weight-semibold); }
    ${c} p { margin: 0; font-size: var(--text-base); line-height: var(--leading-normal); color: var(--color-text-secondary); }
    ${c} figure { margin: var(--space-md) auto 0; width: fit-content; }
    ${c} figure img { display: block; width: 13.75rem; height: auto; border-radius: var(--radius-xl); }
    ${c} .vci-handle-row { display: flex; align-items: center; justify-content: center; flex-wrap: wrap;
      gap: var(--space-sm); margin-top: var(--space-md); }
    ${c} .vci-handle { font-size: var(--text-base); font-weight: var(--font-weight-semibold); user-select: all; }
    ${c} .vci-status { font-size: var(--text-sm); color: var(--color-accent-text); }
    ${c} .vci-helper { margin-top: var(--space-md); font-size: var(--text-sm); color: var(--color-text-muted); text-align: center; }
    ${c} .vci-actions { display: flex; justify-content: flex-end; gap: var(--space-sm); margin-top: calc(var(--space-md) * 1.5); }
    ${c} .vci-btn { min-height: 2.75rem; padding: 0 var(--space-md); display: inline-flex; align-items: center;
      justify-content: center; border-radius: var(--radius-full); font: inherit; font-size: var(--text-base);
      font-weight: var(--font-weight-semibold); text-decoration: none; cursor: pointer; }
    ${c} .vci-secondary { border: 1px solid var(--color-border-medium); background: transparent; color: var(--color-text-primary); }
    ${c} .vci-primary { border: 1px solid transparent; background: var(--color-accent-primary); color: var(--color-text-inverse); }
    ${c} .vci-secondary:hover, ${c} .vci-secondary:focus-visible { background: var(--color-tonal-surface2-background); }
    ${c} .vci-primary:hover, ${c} .vci-primary:focus-visible { background: var(--color-accent-hover); }
    ${c} :focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
    @keyframes venmo-chip-in-enter { from { opacity: 0; transform: translateY(0.5rem); } to { opacity: 1; transform: none; } }
    @media (max-width: 768px) {
      ${c} { width: 100%; max-width: 100%; margin: auto 0 0; border-radius: var(--radius-2xl) var(--radius-2xl) 0 0;
        padding-bottom: calc(var(--space-md) + env(safe-area-inset-bottom, 0px)); }
      ${c} .vci-actions { flex-direction: column; }
    }
    @media (prefers-reduced-motion: reduce) {
      ${c}[open] { animation: venmo-chip-in-fade var(--duration-normal) linear; }
      @keyframes venmo-chip-in-fade { from { opacity: 0; } to { opacity: 1; } }
    }
  `;
  document.head.appendChild(style);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildQr(handle: string): HTMLElement {
  const figure = el('figure', 'vci-qr');
  figure.hidden = true; // shown once the image loads, so a missing file never flashes
  const img = el('img', '');
  img.alt = t('venmoChipIn.qrAlt', { handle });
  img.width = 220; // the Venmo card is 720x637 with its own white background
  img.height = 195;
  img.addEventListener('load', () => (figure.hidden = false));
  img.addEventListener('error', () => figure.remove());
  img.src = VENMO_QR_SRC;
  figure.appendChild(img);
  return figure;
}

function selectText(node: Node): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

function buildHandleRow(handle: string): HTMLElement {
  const row = el('div', 'vci-handle-row');
  const text = el('span', 'vci-handle', `@${handle}`);
  const copy = el('button', 'vci-btn vci-secondary vci-copy', t('venmoChipIn.copy'));
  copy.type = 'button';
  const status = el('span', 'vci-status');
  status.setAttribute('role', 'status');
  copy.addEventListener('click', () => {
    status.textContent = '';
    const write =
      navigator.clipboard?.writeText(`@${handle}`) ?? Promise.reject(new Error('no clipboard'));
    write.then(
      () => (status.textContent = t('venmoChipIn.copied')),
      (error: unknown) => {
        log.debug('Clipboard unavailable, selecting the handle instead', { error: String(error) });
        selectText(text);
      }
    );
  });
  row.append(text, copy, status);
  return row;
}

/** Opens the chip-in card for a Venmo handle (without the @). Returns the dialog. */
export function openVenmoChipIn(handle: string): HTMLDialogElement {
  document.querySelectorAll(`dialog.${DIALOG_CLASS}`).forEach((d) => d.remove());
  injectStyles();

  const dialog = el('dialog', DIALOG_CLASS);
  dialog.setAttribute('aria-labelledby', TITLE_ID);

  const close = (): void => {
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    dialog.remove();
  };

  const closeBtn = el('button', 'vci-close');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', t('venmoChipIn.close'));
  closeBtn.innerHTML = CLOSE_ICON;
  closeBtn.addEventListener('click', close);

  const title = el('h2', '', t('venmoChipIn.title'));
  title.id = TITLE_ID;

  const open = el('a', 'vci-btn vci-primary vci-open', t('venmoChipIn.openVenmo'));
  open.href = venmoPayUrl(handle);
  open.target = '_blank';
  open.rel = 'noopener';

  const later = el('button', 'vci-btn vci-secondary vci-later', t('venmoChipIn.maybeLater'));
  later.type = 'button';
  later.autofocus = true; // first action; never a destructive one
  later.addEventListener('click', close);

  const actions = el('div', 'vci-actions');
  actions.append(later, open);

  dialog.append(
    closeBtn,
    el('p', 'vci-eyebrow', t('venmoChipIn.eyebrow')),
    title,
    el('p', 'vci-body', t('venmoChipIn.body')),
    buildQr(handle),
    buildHandleRow(handle),
    el('p', 'vci-helper', t('venmoChipIn.helper')),
    actions
  );

  // Escape: the browser fires `cancel`; the keydown path covers engines without it.
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });

  document.body.appendChild(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  later.focus();
  log.info('Venmo chip-in opened');
  return dialog;
}
