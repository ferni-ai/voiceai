/**
 * Keyboard focus for every modal dialog, in one place.
 *
 * Around 90 dialog components open by appending markup to <body>; most never
 * moved focus into the dialog, kept Tab inside it, or gave focus back on
 * close, so keyboard and screen-reader users were left on the page behind.
 * This watches the DOM instead of asking each component to remember:
 *
 * - a dialog is modal when it says aria-modal="true", or when it (or a fixed
 *   ancestor) covers most of the viewport, as an overlay does; small fixed
 *   popovers with role="dialog" are left alone
 * - on open, focus moves to its [autofocus] element, else its first control,
 *   else the dialog itself, unless the component already focused inside it
 * - Tab and Shift+Tab cycle within the topmost open modal
 * - panels that stay mounted and open/close by class or style are tracked too
 * - on close (removed, or hidden), focus returns to where it was before
 */

const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"]';
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** Share of the viewport an overlay must cover to count as modal */
const COVERAGE = 0.9;

interface OpenDialog {
  dialog: HTMLElement;
  returnTo: Element | null;
}

const stack: OpenDialog[] = [];

/**
 * Visible and usable. Closed panels often stay mounted and hide with
 * opacity: 0 / pointer-events: none or by sliding off-screen, so those count
 * as hidden; focusing into them would trap the keyboard somewhere invisible.
 */
function isShown(el: HTMLElement): boolean {
  if (!el.isConnected || el.getClientRects().length === 0 || el.closest('[inert], [aria-hidden="true"]')) return false;
  const style = getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none') return false;
  let opacity = 1;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity || 1);
  if (opacity < 0.05) return false;
  const r = el.getBoundingClientRect();
  return r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
}

function coversViewport(el: HTMLElement): boolean {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (getComputedStyle(node).position !== 'fixed') continue;
    const r = node.getBoundingClientRect();
    return r.width * r.height >= COVERAGE * window.innerWidth * window.innerHeight;
  }
  return false;
}

export function isModalDialog(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement) || !el.matches(DIALOG_SELECTOR)) return false;
  const modal = el.getAttribute('aria-modal');
  if (modal === 'true') return true;
  if (modal === 'false') return false;
  return coversViewport(el);
}

function focusablesIn(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isShown);
}

function focusInto(dialog: HTMLElement): void {
  if (dialog.contains(document.activeElement)) return;
  const target = dialog.querySelector<HTMLElement>('[autofocus]') ?? focusablesIn(dialog)[0] ?? dialog;
  if (target === dialog && !dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}

/** Frames to wait for an entrance animation to make a new dialog visible */
const MAX_WAIT_FRAMES = 30;

function opened(dialog: HTMLElement, framesLeft = MAX_WAIT_FRAMES): void {
  if (stack.some((entry) => entry.dialog === dialog)) return;
  // Components append, then fill and animate the dialog in (often from
  // visibility: hidden), so check again on later frames before giving up
  requestAnimationFrame(() => {
    if (!dialog.isConnected || stack.some((e) => e.dialog === dialog)) return;
    if (!isShown(dialog)) {
      if (framesLeft > 0) opened(dialog, framesLeft - 1);
      return;
    }
    if (!isModalDialog(dialog)) return;
    stack.push({ dialog, returnTo: document.activeElement });
    focusInto(dialog);
  });
}

function closed(dialog: HTMLElement): void {
  const index = stack.findIndex((entry) => entry.dialog === dialog);
  if (index === -1) return;
  const [entry] = stack.splice(index, 1);
  const wasTop = index === stack.length;
  const returnTo = entry?.returnTo;
  if (wasTop && returnTo instanceof HTMLElement && isShown(returnTo)) returnTo.focus({ preventScroll: true });
}

/** A tracked dialog's class/style changed: if it is now hidden, hand focus back. */
function settle(dialog: HTMLElement, framesLeft = MAX_WAIT_FRAMES): void {
  requestAnimationFrame(() => {
    if (!stack.some((entry) => entry.dialog === dialog)) return;
    if (!isShown(dialog)) closed(dialog);
    else if (framesLeft > 0) settle(dialog, framesLeft - 1); // let an exit animation finish
  });
}

/** Panels that stay mounted open and close by toggling a class or style. */
function changed(dialog: HTMLElement): void {
  if (stack.some((entry) => entry.dialog === dialog)) settle(dialog);
  else opened(dialog);
}

/** Drop dialogs that were hidden rather than removed; return the topmost live one. */
function topDialog(): HTMLElement | undefined {
  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i] as OpenDialog;
    if (isShown(entry.dialog)) return entry.dialog;
    closed(entry.dialog);
  }
  return undefined;
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const dialog = topDialog();
  if (!dialog) return;
  const items = focusablesIn(dialog);
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (!first || !last) {
    event.preventDefault();
    focusInto(dialog);
  } else if (event.shiftKey && (active === first || !dialog.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

function each(node: Node, handle: (dialog: HTMLElement) => void): void {
  if (!(node instanceof HTMLElement)) return;
  if (node.matches(DIALOG_SELECTOR)) handle(node);
  node.querySelectorAll<HTMLElement>(DIALOG_SELECTOR).forEach(handle);
}

/** Start managing dialog focus for the page; returns an uninstall function. */
export function installDialogFocus(root: HTMLElement = document.body): () => void {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        if (record.target instanceof HTMLElement && record.target.matches(DIALOG_SELECTOR)) changed(record.target);
        continue;
      }
      record.addedNodes.forEach((node) => each(node, (dialog) => opened(dialog)));
      record.removedNodes.forEach((node) => each(node, closed));
    }
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'inert'],
  });
  document.addEventListener('keydown', onKeydown, true);
  return () => {
    observer.disconnect();
    document.removeEventListener('keydown', onKeydown, true);
    stack.length = 0;
  };
}
