/**
 * Gate-first paint. Off by default.
 *
 * Signed out on a cold start, the Home shell in index.html painted for about
 * 12 s on a slow phone with a "Talk to Ferni" button that did nothing, then
 * the sign-in gate replaced it (mobile web audit 2026-10-20, P1-1). With the
 * flag on, the head script in index.html finds no remembered session on the
 * home path and adds `gate-first` to <html>: #app stays hidden and a static
 * copy of the gate's layout (#gateFirst) paints instead, its button disabled
 * and marked busy. Once initializeAuth resolves, app.ts calls settleGateFirst:
 * signed in, the app shows at once; signed out, the real gate fades in over
 * the copy, then the copy goes.
 *
 * Turn it on for a build with VITE_GATE_FIRST=true, or for one browser with
 * localStorage `ferni:flag:gate-first` = 'true' ('false' forces it off). The
 * head script reads both, since it runs before any module loads.
 *
 * The session hint is kept whether or not the flag is on, so turning the flag
 * on doesn't show a returning person a sign-in screen on their next visit.
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

let tracking = false;

export function rememberSessionHint(signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(SESSION_HINT_KEY, '1');
    else localStorage.removeItem(SESSION_HINT_KEY);
  } catch (error) {
    log.debug('localStorage unavailable for the session hint', { error: String(error) });
  }
}

/** Show #app and drop the placeholder. Safe to call more than once. */
export function revealApp(): void {
  document.documentElement.classList.remove(GATE_FIRST_CLASS);
  document.getElementById(PLACEHOLDER_ID)?.remove();
}

/**
 * Call once initializeAuth resolves. `showAppNow` is false only when the
 * sign-in gate opens next: the copy stays until the real gate has faded in.
 */
export function settleGateFirst(signedIn: boolean, showAppNow: boolean = signedIn): void {
  rememberSessionHint(signedIn);
  if (!tracking) {
    tracking = true;
    onAuthStateChange((state) => rememberSessionHint(state.isAuthenticated)); // signing out clears it
  }
  if (showAppNow || !document.documentElement.classList.contains(GATE_FIRST_CLASS)) {
    revealApp();
    return;
  }
  setTimeout(revealApp, DURATION.SLOW);
}
