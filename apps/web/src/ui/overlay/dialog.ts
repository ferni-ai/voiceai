/**
 * Dialog: the one modal primitive (behind the overlay-host flag, see
 * overlay-flag.ts).
 *
 * Built on the native `<dialog>` and `showModal()`, so the browser supplies the
 * top layer (no z-index), an inert background, focus moving in and Escape
 * (via `cancel`). This module adds what the platform leaves out:
 * - presentation: a centred alert/dialog on desktop; on phones, `sm` stays a
 *   centred alert and `md`/`lg` become a bottom sheet with medium and large
 *   detents (drag the grabber up to expand, down to dismiss)
 * - focus returns to whatever opened the dialog
 * - one ref-counted scroll lock shared by every open dialog
 * - backdrop clicks close it unless `dismissible: false`
 *
 * @module ui/overlay/dialog
 */

import { DURATION } from '../../config/animation-constants.js';
import { injectDialogStyles } from './dialog.styles.js';

export type DialogSize = 'sm' | 'md' | 'lg';
export type DialogCloseReason = 'escape' | 'backdrop' | 'drag' | 'api';

export interface DialogOptions {
  size?: DialogSize;
  /** Accessible name: the id of the heading inside `content`, or a label. */
  labelledBy?: string;
  label?: string;
  describedBy?: string;
  /** 'alertdialog' for confirmations that interrupt (default: the native dialog role). */
  role?: 'alertdialog';
  /** Escape, backdrop and drag close it (default true). */
  dismissible?: boolean;
  /** Phones only: the sheet's starting height (default medium). */
  detent?: 'medium' | 'large';
  className?: string;
  onClose?: (reason: DialogCloseReason) => void;
}

export interface DialogHandle {
  readonly element: HTMLDialogElement;
  close(reason?: DialogCloseReason): void;
}

const PHONE_QUERY = '(max-width: 768px)';
const DRAG_CLOSE_PX = 80;
const DRAG_EXPAND_PX = 48;

let scrollLocks = 0;

function lockScroll(): void {
  if (scrollLocks++ === 0) document.documentElement.classList.add('ferni-scroll-locked');
}

function unlockScroll(): void {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.documentElement.classList.remove('ferni-scroll-locked');
}

function isSheet(size: DialogSize): boolean {
  return size !== 'sm' && Boolean(window.matchMedia?.(PHONE_QUERY).matches);
}

/** Drag the grabber: up expands a medium sheet, down past 80 px dismisses. */
function wireGrabber(dialog: HTMLDialogElement, grabber: HTMLElement, onDismiss: () => void): void {
  let startY: number | null = null;
  grabber.addEventListener('pointerdown', (e) => {
    startY = e.clientY;
    grabber.setPointerCapture?.(e.pointerId);
  });
  grabber.addEventListener('pointermove', (e) => {
    if (startY === null) return;
    const dy = Math.max(0, e.clientY - startY);
    dialog.style.setProperty('--ferni-sheet-drag', `${dy}px`);
  });
  const end = (e: PointerEvent): void => {
    if (startY === null) return;
    const dy = e.clientY - startY;
    startY = null;
    dialog.style.removeProperty('--ferni-sheet-drag');
    if (dy > DRAG_CLOSE_PX) onDismiss();
    else if (dy < -DRAG_EXPAND_PX) dialog.dataset.detent = 'large';
  };
  grabber.addEventListener('pointerup', end);
  grabber.addEventListener('pointercancel', end);
}

export function openDialog(content: HTMLElement, options: DialogOptions = {}): DialogHandle {
  injectDialogStyles();
  const size = options.size ?? 'md';
  const sheet = isSheet(size);
  const dismissible = options.dismissible ?? true;
  const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const dialog = document.createElement('dialog');
  dialog.className = [
    'ferni-dialog',
    `ferni-dialog--${size}`,
    sheet ? 'ferni-dialog--sheet' : 'ferni-dialog--center',
    options.className ?? '',
  ]
    .join(' ')
    .trim();
  if (sheet) dialog.dataset.detent = options.detent ?? 'medium';
  if (options.labelledBy) dialog.setAttribute('aria-labelledby', options.labelledBy);
  else if (options.label) dialog.setAttribute('aria-label', options.label);
  if (options.describedBy) dialog.setAttribute('aria-describedby', options.describedBy);
  if (options.role) dialog.setAttribute('role', options.role);

  let closed = false;
  const close = (reason: DialogCloseReason = 'api'): void => {
    if (closed) return;
    closed = true;
    dialog.classList.add('ferni-dialog--closing');
    options.onClose?.(reason);
    window.setTimeout(() => {
      if (typeof dialog.close === 'function' && dialog.hasAttribute('open')) dialog.close();
      dialog.remove();
      unlockScroll();
      if (returnTo?.isConnected) returnTo.focus({ preventScroll: true });
    }, DURATION.NORMAL);
  };

  if (sheet) {
    const grabber = document.createElement('div');
    grabber.className = 'ferni-dialog__grabber';
    grabber.setAttribute('aria-hidden', 'true');
    dialog.appendChild(grabber);
    if (dismissible) wireGrabber(dialog, grabber, () => close('drag'));
  }
  const surface = document.createElement('div');
  surface.className = 'ferni-dialog__surface';
  surface.appendChild(content);
  dialog.appendChild(surface);

  dialog.addEventListener('cancel', (e) => {
    e.preventDefault(); // close through close() so the exit animation and callbacks run
    if (dismissible) close('escape');
  });
  dialog.addEventListener('click', (e) => {
    // A click on the dialog box itself (not its content) is the backdrop.
    if (dismissible && e.target === dialog) close('backdrop');
  });

  document.body.appendChild(dialog);
  lockScroll();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  return { element: dialog, close };
}

/** Tests only. */
export function resetDialogScrollLock(): void {
  scrollLocks = 0;
  document.documentElement.classList.remove('ferni-scroll-locked');
}
