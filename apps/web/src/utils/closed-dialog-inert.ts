/**
 * Closed dialogs leave the accessibility tree and the tab order, in one place.
 *
 * Most panels stay mounted when closed and hide by fading to opacity 0 or
 * sliding off-screen. Unlike display: none or visibility: hidden, that leaves
 * them in the accessibility tree and their buttons in the tab order: screen
 * readers could reach closed panels such as "Conversation history", "Music
 * history" and "How was that?" (app audit 2026-11-16, item 18). Rather than
 * ask each of ~90 dialog components to remember, this watches the DOM:
 *
 * - a dialog is closed when it is laid out but faded below 5% opacity, or,
 *   inside a fixed layer, wholly outside the viewport. One hidden by
 *   display: none or visibility: hidden is already out of the tree; left alone.
 * - a closed dialog gets `inert`, tagged so this only ever lifts its own
 * - it is re-checked each frame for a moment after it (or, once inert, an
 *   ancestor) changes class or style, and when a transition or animation in
 *   it ends, so a panel never stays inert once it is on screen
 *
 * Installed by installDialogFocus (dialog-focus.ts), which lifts the mark
 * before it moves focus into a dialog that has just opened.
 */

const DIALOGS = '[role="dialog"], [role="alertdialog"]';
/** Set alongside the `inert` this module adds, so a component's own `inert` is never touched. */
export const CLOSED_MARK = 'data-closed-inert';
/** Frames to keep re-checking after a change: covers a ~500 ms open or close animation. */
const SETTLE_FRAMES = 30;
/** Frames for a change outside the dialog (an ancestor's class): enough for one style pass. */
const ANCESTOR_FRAMES = 2;

function opacity(el: HTMLElement): number {
  let value = 1;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    value *= Number(getComputedStyle(node).opacity || 1);
  }
  return value;
}

function inFixedLayer(el: HTMLElement): boolean {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (getComputedStyle(node).position === 'fixed') return true;
  }
  return false;
}

/**
 * Laid out, yet closed. Off-screen counts only inside a fixed layer: a dialog
 * in the page flow below the fold is merely scrolled away, not closed.
 */
function isClosedDialog(el: HTMLElement): boolean {
  if (!el.isConnected || el.getClientRects().length === 0) return false;
  if (getComputedStyle(el).visibility === 'hidden') return false;
  if (opacity(el) < 0.05) return true;
  if (!inFixedLayer(el)) return false;
  const r = el.getBoundingClientRect();
  return r.right <= 0 || r.bottom <= 0 || r.left >= window.innerWidth || r.top >= window.innerHeight;
}

/** Dialogs this module made inert; few, so checking them on every change is cheap. */
const marked = new Set<HTMLElement>();

/** Lift the `inert` this module set, if any (dialog-focus calls it before focusing in). */
export function releaseClosedInert(el: HTMLElement): void {
  marked.delete(el);
  if (!el.hasAttribute(CLOSED_MARK)) return;
  el.removeAttribute('inert');
  el.removeAttribute(CLOSED_MARK);
}

function sync(el: HTMLElement): void {
  if (!isClosedDialog(el)) releaseClosedInert(el);
  else if (!el.hasAttribute('inert')) {
    el.setAttribute(CLOSED_MARK, '');
    el.setAttribute('inert', '');
    marked.add(el);
  }
}

const settling = new Map<HTMLElement, number>();
let frameQueued = false;

function tick(): void {
  frameQueued = false;
  for (const [el, framesLeft] of settling) {
    sync(el);
    if (framesLeft <= 0 || !el.isConnected) settling.delete(el);
    else settling.set(el, framesLeft - 1);
  }
  if (settling.size > 0) queueFrame();
}

function queueFrame(): void {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(tick);
}

function settle(el: HTMLElement, frames = SETTLE_FRAMES): void {
  settling.set(el, Math.max(frames, settling.get(el) ?? 0));
  queueFrame();
}

/** Inert dialogs inside (or wrapping) `node`: the ones a change there could reopen. */
function markedNear(node: Node): HTMLElement[] {
  return [...marked].filter((el) => node.contains(el) || el.contains(node));
}

function eachDialog(node: Node, handle: (dialog: HTMLElement) => void): void {
  if (!(node instanceof HTMLElement)) return;
  if (node.matches(DIALOGS)) handle(node);
  node.querySelectorAll<HTMLElement>(DIALOGS).forEach(handle);
}

/** Start keeping closed dialogs inert under `root`; returns an uninstall function. */
export function installClosedDialogInert(root: HTMLElement = document.body): () => void {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'childList') {
        record.addedNodes.forEach((node) => eachDialog(node, (dialog) => settle(dialog)));
        record.removedNodes.forEach((node) => eachDialog(node, releaseClosedInert));
      } else if (record.target instanceof HTMLElement && record.target.matches(DIALOGS)) {
        settle(record.target);
      } else {
        markedNear(record.target).forEach((dialog) => settle(dialog, ANCESTOR_FRAMES));
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  const onMotionEnd = (event: Event): void => {
    if (event.target instanceof Node) markedNear(event.target).forEach((dialog) => settle(dialog, ANCESTOR_FRAMES));
  };
  document.addEventListener('transitionend', onMotionEnd, true);
  document.addEventListener('animationend', onMotionEnd, true);
  eachDialog(root, (dialog) => settle(dialog));
  return () => {
    observer.disconnect();
    document.removeEventListener('transitionend', onMotionEnd, true);
    document.removeEventListener('animationend', onMotionEnd, true);
    settling.clear();
    [...marked].forEach(releaseClosedInert);
  };
}
