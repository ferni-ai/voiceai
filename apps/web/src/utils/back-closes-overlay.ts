/**
 * Back closes what's open.
 *
 * Nothing in the app used the history API, so with a panel, sheet or the menu
 * open, Android's back gesture (the Play app is a TWA, where back is history
 * back) and the browser's back button left the app instead of closing it.
 *
 * While anything dismissable is on screen this holds one history entry of its
 * own. Back pops it, and the top overlay closes the way Escape closes it (every
 * panel already does; native modal dialogs get `requestClose`). When the last
 * overlay closes some other way (its close button, Escape), the entry is popped
 * quietly so the next back press leaves the app as it always did.
 *
 * @module utils/back-closes-overlay
 */

const STATE_KEY = 'ferniOverlay';
const CANDIDATES = '[role="dialog"], [role="alertdialog"], dialog[open], .settings-menu--visible';
/** A dialog this share of the screen or more is something back should close (sheets, panels). */
const MIN_COVERAGE = 0.25;
/** After back closes an overlay, let its exit animation finish before deciding to hold again. */
const SETTLE_MS = 500;
/** How long nothing must be open before the held entry is given back. */
const RELEASE_MS = 300;

function isShown(el: HTMLElement): boolean {
  if (
    !el.isConnected ||
    el.getClientRects().length === 0 ||
    el.closest('[inert], [aria-hidden="true"]')
  )
    return false;
  const style = getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none')
    return false;
  let opacity = 1;
  for (let node: HTMLElement | null = el; node; node = node.parentElement)
    opacity *= Number(getComputedStyle(node).opacity || 1);
  if (opacity < 0.05) return false;
  const r = el.getBoundingClientRect();
  return r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
}

function dismissable(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (el.matches('dialog:modal, .settings-menu--visible, [aria-modal="true"]')) return true;
  return r.width * r.height >= MIN_COVERAGE * window.innerWidth * window.innerHeight;
}

/** Overlays on screen that back should close. */
export function openOverlays(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(CANDIDATES)].filter(
    (el) => isShown(el) && dismissable(el)
  );
}

function closeTop(): void {
  const native = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')]
    .filter((d) => d.matches(':modal'))
    .pop();
  if (native) {
    const withRequest = native as HTMLDialogElement & { requestClose?: () => void };
    if (typeof withRequest.requestClose === 'function') withRequest.requestClose();
    else native.close();
    return;
  }
  const target =
    document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })
  );
}

/** True while the page has transient user activation (a tap or key press moments ago). */
function userJustActed(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } })
    .userActivation;
  return activation ? activation.isActive : true;
}

const ours = (state: unknown): boolean =>
  typeof state === 'object' &&
  state !== null &&
  (state as Record<string, unknown>)[STATE_KEY] === true;

/** Start letting back close the top overlay; returns an uninstall function. */
export function installBackClosesOverlay(root: HTMLElement = document.body): () => void {
  let holding = false; // our entry is the current one
  let quietPops = 0; // pops we caused ourselves
  let settleUntil = 0;
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;

  const sync = (): void => {
    frame = 0;
    const open = openOverlays().length > 0;
    if (open) {
      clearTimeout(releaseTimer);
      releaseTimer = undefined;
    }
    if (open && !holding) {
      // A quiet pop is still in flight: pushing now would be undone by it
      const wait = quietPops > 0 ? 50 : settleUntil - Date.now();
      if (wait > 0) {
        clearTimeout(timer);
        timer = setTimeout(schedule, wait);
        return;
      }
      // Only for something the person just opened: the sign-in gate and other
      // screens that open on their own, or that Escape can't close, must not
      // turn back into a trap.
      if (!userJustActed()) return;
      history.pushState({ ...(history.state as object | null), [STATE_KEY]: true }, '');
      holding = true;
    } else if (!open && holding && !releaseTimer) {
      // Nothing open: wait a moment, since one panel often closes as the next
      // opens (the sheet hands over to the menu), then give the entry back.
      releaseTimer = setTimeout(() => {
        releaseTimer = undefined;
        if (!holding || openOverlays().length > 0) return;
        holding = false;
        if (ours(history.state)) {
          quietPops++;
          history.back();
        }
      }, RELEASE_MS);
    }
  };
  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(sync);
  };

  const onPop = (): void => {
    if (quietPops > 0) {
      quietPops--;
      return;
    }
    if (!holding) return;
    holding = false;
    settleUntil = Date.now() + SETTLE_MS;
    closeTop();
    schedule();
  };

  // Panels open by sliding or fading in, and are on screen only once that
  // ends, often with no further DOM change: check again when it does.
  const onSettled = (): void => schedule();
  const observer = new MutationObserver(schedule);
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden', 'inert'],
  });
  window.addEventListener('popstate', onPop);
  root.addEventListener('transitionend', onSettled, true);
  root.addEventListener('animationend', onSettled, true);
  return () => {
    root.removeEventListener('transitionend', onSettled, true);
    root.removeEventListener('animationend', onSettled, true);
    observer.disconnect();
    window.removeEventListener('popstate', onPop);
    if (frame) cancelAnimationFrame(frame);
    clearTimeout(timer);
    clearTimeout(releaseTimer);
  };
}
