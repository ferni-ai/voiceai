/**
 * Call End Paths
 *
 * Which ways a call can end, and which of them are the planned end rather than
 * a drop. `call-end.ts` owns what the screen does once a call is over; this
 * module decides when that happens.
 *
 * - The agent's goodbye (`conversation_end`) plays the one end sound. The
 *   hang-up that follows stays quiet (a plain bug fix, not flagged).
 * - The room closing after a planned goodbye (deleted, or we were removed) is
 *   the planned end, not a dropped call, flag on or off: the agent closes the
 *   room after every goodbye (GOODBYE_ENDS_CALL, default on), and prod web
 *   builds have never set VITE_CALL_WRAP_UP.
 * - With VITE_CALL_WRAP_UP on, only a planned goodbye (services/planned-goodbye.ts) is
 *   the agent ending the call:
 *   - the agent leaving after one is left to it;
 *   - the agent leaving without one (silence, a crash, a drop, anything
 *     unclear) never hangs up here: the reconnect prompt (#1328,
 *     services/agent-drop-watch.ts) or today's path takes it;
 *   - holdToastsPastCard and wrapUpToastSignal hold toasts past the after-call
 *     card's entrance. Not yet wired: the toast region's in-call gate (#1011)
 *     still uses appCallSignal.
 *
 * @module app/call-end-paths
 */

import { appState, setWrappingUp } from '../state/app.state.js';
import type { ConversationEndEvent } from '../types/events.js';
import { soundUI } from '../ui/sound.ui.js';
import { createLogger } from '../utils/logger.js';
import { isCallWrapUpEnabled } from '../config/call-wrap-up-flag.js';
import { isPlannedGoodbye } from '../services/planned-goodbye.js';

const log = createLogger('CallEndPaths');

/** Held toasts go this long after the end at the latest (the card lands at ~0.8 s). */
export const HELD_TOAST_RELEASE_MS = 2500;
/** On window: held toasts may show now. */
export const RELEASE_HELD_TOASTS_EVENT = 'ferni:release-held-toasts';
/** On document: the after-call card was closed. */
export const AFTER_CALL_CARD_CLOSED_EVENT = 'ferni:after-call-card-closed';

/** The agent's goodbye sound has played for this call. */
let goodbyeDone = false;
/** A planned goodbye (`conversation_end`, planned-goodbye.ts) arrived: the agent is ending the call. */
let plannedGoodbye = false;
/** Stops the pending hold without releasing; null when nothing is held. */
let cancelHold: (() => void) | null = null;

// Each call attempt starts clean.
appState.subscribe('connection', (state) => {
  if (state !== 'connecting') return;
  goodbyeDone = false;
  plannedGoodbye = false;
});

/** The agent's goodbye: the one end sound of an agent-ended call. */
export function playGoodbyeSound(sound: 'goodbye' | 'phoneClick'): void {
  soundUI.play(sound, 'goodbye');
  goodbyeDone = true;
}

/** A hang-up sound (ceremony or disconnect): silent once the agent's goodbye has played the one end sound. */
export function playEndSound(sound: 'goodbye' | 'hangup' | 'disconnect'): void {
  if (!goodbyeDone) soundUI.play(sound, 'goodbye');
}

/** `conversation_end` arrived. With wrap-up on, a warm planned goodbye gets the goodbye ceremony. */
export function noteConversationEnd(event: ConversationEndEvent): void {
  log.info('Conversation end signal received:', {
    reason: event.reason,
    exitType: event.exitType,
    delay: event.disconnectDelay,
  });
  plannedGoodbye = isPlannedGoodbye(event.reason);
  if (isCallWrapUpEnabled() && plannedGoodbye && event.reason !== 'agent_exit') {
    setWrappingUp(true);
  }
}

/** The room closed under us after a planned goodbye: the planned end, so no "dropped" notice. */
export function afterConversationEnd(): boolean {
  return plannedGoodbye;
}

/**
 * The agent left the room. Never ends the call: the agent may end a call only
 * after a planned goodbye, and then the goodbye's own hang-up does. True when,
 * with wrap-up on, something else owns this departure, so the caller skips its
 * old "See you next time!" path: the goodbye, or (no goodbye) the reconnect
 * prompt, which wrap-up always turns on and which "see you" would contradict.
 */
export function wrapUpOwnsAgentLeaving(): boolean {
  return isCallWrapUpEnabled();
}

/**
 * Hold toasts past the after-call card's entrance: they go when the card is
 * closed, or HELD_TOAST_RELEASE_MS after the end, whichever comes first. If a
 * new call is live by then they stay held for that call's end.
 */
export function holdToastsPastCard(): void {
  cancelHold?.(); // a newer end takes over; its release covers everything held
  const timer = setTimeout(release, HELD_TOAST_RELEASE_MS);
  function stop(): void {
    clearTimeout(timer);
    document.removeEventListener(AFTER_CALL_CARD_CLOSED_EVENT, release);
    cancelHold = null;
  }
  function release(): void {
    stop();
    if (appState.get('connection') === 'connected') return;
    window.dispatchEvent(new CustomEvent(RELEASE_HELD_TOASTS_EVENT));
  }
  document.addEventListener(AFTER_CALL_CARD_CLOSED_EVENT, release);
  cancelHold = stop;
}

/**
 * The toast region's call signal (the `CallSignal` shape of the in-call gate,
 * #1011) for wrap-up: the call counts as on until held toasts are released.
 */
export const wrapUpToastSignal = {
  isLive: (): boolean =>
    cancelHold !== null || ['connected', 'reconnecting'].includes(appState.get('connection')),
  onCallEnd: (callback: () => void): (() => void) => {
    const onRelease = (): void => callback();
    window.addEventListener(RELEASE_HELD_TOASTS_EVENT, onRelease);
    return () => window.removeEventListener(RELEASE_HELD_TOASTS_EVENT, onRelease);
  },
};
