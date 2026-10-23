/**
 * Conversation Continue
 *
 * The agent can take back a goodbye (#2291). After `conversation_end` the app
 * keeps its goodbye on screen for `disconnectDelay` and then hangs up. If, in
 * that time, a crisis read of the caller's last words finds risk, or the caller
 * says more than a goodbye, the agent sends `conversation_continue`: a call
 * never ends on crisis risk, and a caller who is still talking hasn't left.
 *
 * Here that cancels the pending hang-up, undoes the goodbye ceremony's state
 * (call-end-paths.ts), clears the goodbye notice and expression, and announces
 * `ferni:conversation-continue` so the call machine (call/call-machine.ts) can
 * move from `ending` back to `listening`.
 *
 * While the caller is still talking (interim transcripts), the agent sends
 * `conversation_hold`: the hang-up moves to `disconnectDelay` after the latest
 * hold, never later than MAX_END_HOLD_MS after `conversation_end`. A hold never
 * reopens the call; it only gives the caller's words time to land.
 *
 * data-message-handlers.ts schedules its hang-up through scheduleEndDisconnect
 * so this module can cancel it. With VITE_CALL_WRAP_UP on, that hang-up runs
 * the goodbye ceremony first (app.ts performGoodbyeCeremony, ~1.9 s); a
 * continue during it stops the ceremony before it disconnects
 * (watchGoodbyeCeremony).
 *
 * @module app/conversation-continue
 */

import { ferniExpressions } from '../ui/ferni-expressions.ui.js';
import { messageUI } from '../ui/message.ui.js';
import { presenceUI } from '../ui/presence.ui.js';
import { createLogger } from '../utils/logger.js';
import { noteConversationContinue } from './call-end-paths.js';

const log = createLogger('ConversationContinue');

/** Window event: the agent took back its goodbye; `detail.reason` says why. */
export const CONVERSATION_CONTINUE_EVENT = 'ferni:conversation-continue';

/** The caller is still talking after `conversation_end`: hold the hang-up. */
export interface ConversationHoldEvent {
  readonly type: 'conversation_hold';
  readonly reason: 'caller_speaking';
  readonly timestamp: number;
}

/** The longest a goodbye's hang-up is held after `conversation_end`. */
export const MAX_END_HOLD_MS = 8_000;

/** The agent reopened the call after `conversation_end`. */
export interface ConversationContinueEvent {
  readonly type: 'conversation_continue';
  /** crisis_hold: risk on the call, which never ends then. caller_spoke: they kept talking. */
  readonly reason: 'crisis_hold' | 'caller_spoke';
  readonly timestamp: number;
}

export function isConversationContinueMessage(data: unknown): data is ConversationContinueEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Record<string, unknown>)['type'] === 'conversation_continue'
  );
}

/** The hang-up scheduled by the latest `conversation_end`, until it runs or is cancelled. */
let pending: { disconnect: () => void; delay: number; endedAt: number } | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function fire(): void {
  const due = pending;
  pending = null;
  pendingTimer = null;
  due?.disconnect();
}

/** Hang up after `delay` ms, unless cancelEndDisconnect runs first. Replaces any pending one. */
export function scheduleEndDisconnect(disconnect: () => void, delay: number): void {
  cancelEndDisconnect();
  pending = { disconnect, delay, endedAt: Date.now() };
  pendingTimer = setTimeout(fire, delay);
}

/**
 * The caller is still talking: move the pending hang-up to `delay` after now,
 * capped at MAX_END_HOLD_MS after it was scheduled. Returns whether one was pending.
 */
export function holdEndDisconnect(): boolean {
  if (pending === null) return false;
  if (pendingTimer !== null) clearTimeout(pendingTimer);
  const now = Date.now();
  const at = Math.min(now + pending.delay, pending.endedAt + MAX_END_HOLD_MS);
  pendingTimer = setTimeout(fire, Math.max(0, at - now));
  return true;
}

/** Cancel the pending hang-up. Returns whether one was pending. */
export function cancelEndDisconnect(): boolean {
  if (pending === null) return false;
  if (pendingTimer !== null) clearTimeout(pendingTimer);
  pending = null;
  pendingTimer = null;
  return true;
}

export function isConversationHoldMessage(data: unknown): data is ConversationHoldEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Record<string, unknown>)['type'] === 'conversation_hold'
  );
}

/**
 * For the data-message dispatcher: handles `message` if it is
 * `conversation_continue` or `conversation_hold`.
 */
export function routeConversationContinue(message: unknown): boolean {
  if (isConversationHoldMessage(message)) {
    log.info('Goodbye hang-up held: the caller is still talking', { held: holdEndDisconnect() });
    return true;
  }
  if (!isConversationContinueMessage(message)) return false;
  handleConversationContinue(message);
  return true;
}

/** conversation_continue messages so far, for a goodbye ceremony already under way. */
let continues = 0;

/**
 * For app.ts's goodbye ceremony: `pause(ms)` waits, then says whether the
 * agent took its goodbye back since the ceremony began. If so the ceremony
 * stops before it disconnects, and the avatar comes back from settling.
 */
export function watchGoodbyeCeremony(): { pause: (ms: number) => Promise<boolean> } {
  const since = continues;
  return {
    pause: async (ms) => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });
      if (continues === since) return false;
      log.info('Goodbye ceremony stopped: the agent took its goodbye back');
      presenceUI.resetFromSettling();
      return true;
    },
  };
}

/** `conversation_continue` arrived: the call carries on. */
export function handleConversationContinue(event: ConversationContinueEvent): void {
  continues++;
  const cancelled = cancelEndDisconnect();
  log.info('Conversation continues after goodbye:', { reason: event.reason, cancelled });
  noteConversationContinue();
  messageUI.clear();
  ferniExpressions.setExpression('neutral', 400, 0);
  window.dispatchEvent(
    new CustomEvent(CONVERSATION_CONTINUE_EVENT, { detail: { reason: event.reason } })
  );
}
