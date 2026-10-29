/**
 * Gate-first paint. On by default since the motion audit of 2026-10-29 (P8).
 *
 * Signed out on a cold start, the Home shell in index.html used to paint
 * first, then the sign-in gate cross-faded over it with two avatars on screen,
 * and Home kept animating, unseen, under the gate (mobile web audit 2026-10-20
 * P1-1; motion audit P8). The head script in index.html finds no remembered
 * session on the home path and adds `gate-first` to <html>: #app stays hidden
 * with its animations paused, and a static copy of the gate's layout
 * (#gateFirst) paints instead, its buttons disabled and marked busy. Once
 * initializeAuth resolves, app.ts calls settleGateFirst: signed in, the app
 * shows at once; signed out, the sign-in gate takes the copy's place in a
 * single frame (showGateOverApp), with Home still hidden and paused under it.
 *
 * Turn it off for a build with VITE_GATE_FIRST=false, or for one browser with
 * localStorage `ferni:flag:gate-first` = 'false' ('true' forces it on). The
 * head script reads both, since it runs before any module loads.
 *
 * The session hint is kept whether or not the flag is on, so a returning
 * person never sees a sign-in screen on their next visit.
 *
 * @module ui/gate-first
 */

import { DURATION } from '../config/animation-constants.js';
import { onAuthStateChange } from '../services/firebase-auth.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('GateFirst');

/** Read by the head script in index.html: '1' means a session was signed in last time. */
export const SESSION_HINT_KEY = 'ferni:session-hint';
/** Set on <html> by the head script in index.html. */
export const GATE_FIRST_CLASS = 'gate-first';
const PLACEHOLDER_ID = 'gateFirst';
/** On <html> while the sign-in gate covers the app: index.html hides #app, paused-when-hidden.css pauses it. */
export const GATE_UP_CLASS = 'sign-in-gate-up';

let tracking = false;

export function rememberSessionHint(signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(SESSION_HINT_KEY, '1');
    else localStorage.removeItem(SESSION_HINT_KEY);
  } catch (error) {
    log.debug('localStorage unavailable for the session hint', { error: String(error) });
  }
}

/** True while the static copy of the gate is on screen. */
export function isGateFirstPainted(): boolean {
  return (
    document.documentElement.classList.contains(GATE_FIRST_CLASS) &&
    !!document.getElementById(PLACEHOLDER_ID)
  );
}

/** Resolves once `img` can paint, or after DURATION.SLOW, so a swap never shows an empty circle. */
function imageReady(img: HTMLImageElement | null): Promise<void> {
  if (!img || typeof img.decode !== 'function') return Promise.resolve();
  const decoded = img.decode().catch(() => undefined);
  return Promise.race([decoded, new Promise<void>((resolve) => setTimeout(resolve, DURATION.SLOW))]);
}

/**
 * Drop the placeholder and stop holding #app hidden for it. Safe to call more
 * than once. While the sign-in gate is up it keeps #app hidden itself.
 */
export function revealApp(): void {
  document.documentElement.classList.remove(GATE_FIRST_CLASS);
  document.getElementById(PLACEHOLDER_ID)?.remove();
}

/**
 * Call once initializeAuth resolves. `showAppNow` is false only when the
 * sign-in gate opens next: the copy stays until the gate takes its place.
 */
export function settleGateFirst(signedIn: boolean, showAppNow: boolean = signedIn): void {
  rememberSessionHint(signedIn);
  if (!tracking) {
    tracking = true;
    onAuthStateChange((state) => rememberSessionHint(state.isAuthenticated)); // signing out clears it
  }
  if (showAppNow || !isGateFirstPainted()) revealApp(); // flag off: just drop the unused copy
}

/**
 * Put the sign-in gate on screen with Home hidden (and paused) under it, so the
 * two never show through each other. Over the gate-first copy it takes the
 * copy's place in one frame, once its avatar can paint; otherwise it fades in.
 */
export async function showGateOverApp(overlay: HTMLElement): Promise<void> {
  const replacingCopy = isGateFirstPainted();
  if (replacingCopy) await imageReady(overlay.querySelector('img'));
  document.documentElement.classList.add(GATE_UP_CLASS);
  document.body.appendChild(overlay);
  if (replacingCopy) {
    overlay.style.transition = 'none'; // same layout as the copy: no fade, never two on screen
    overlay.classList.add('visible');
    revealApp(); // drops the copy; #app stays hidden under GATE_UP_CLASS
    return;
  }
  void overlay.offsetHeight; // reflow, so the fade-in animates
  overlay.classList.add('visible');
}

/** The gate is going: Home comes back as it fades out. */
export function uncoverApp(overlay: HTMLElement): void {
  document.documentElement.classList.remove(GATE_UP_CLASS);
  overlay.style.removeProperty('transition');
}
