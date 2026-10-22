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
 * data-message-handlers.ts schedules its hang-up through scheduleEndDisconnect
 * so this module can cancel it.
 *
 * @module app/conversation-continue
 */

import { ferniExpressions } from '../ui/ferni-expressions.ui.js';
import { messageUI } from '../ui/message.ui.js';
import { createLogger } from '../utils/logger.js';
import { noteConversationContinue } from './call-end-paths.js';

const log = createLogger('ConversationContinue');

/** Window event: the agent took back its goodbye; `detail.reason` says why. */
export const CONVERSATION_CONTINUE_EVENT = 'ferni:conversation-continue';

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
let pendingDisconnect: ReturnType<typeof setTimeout> | null = null;

/** Hang up after `delay` ms, unless cancelEndDisconnect runs first. Replaces any pending one. */
export function scheduleEndDisconnect(disconnect: () => void, delay: number): void {
  cancelEndDisconnect();
  pendingDisconnect = setTimeout(() => {
    pendingDisconnect = null;
    disconnect();
  }, delay);
}

/** Cancel the pending hang-up. Returns whether one was pending. */
export function cancelEndDisconnect(): boolean {
  if (pendingDisconnect === null) return false;
  clearTimeout(pendingDisconnect);
  pendingDisconnect = null;
  return true;
}

/** For the data-message dispatcher: handles `message` if it is `conversation_continue`. */
export function routeConversationContinue(message: unknown): boolean {
  if (!isConversationContinueMessage(message)) return false;
  handleConversationContinue(message);
  return true;
}

/** `conversation_continue` arrived: the call carries on. */
export function handleConversationContinue(event: ConversationContinueEvent): void {
  const cancelled = cancelEndDisconnect();
  log.info('Conversation continues after goodbye:', { reason: event.reason, cancelled });
  noteConversationContinue();
  messageUI.clear();
  ferniExpressions.setExpression('neutral', 400, 0);
  window.dispatchEvent(
    new CustomEvent(CONVERSATION_CONTINUE_EVENT, { detail: { reason: event.reason } })
  );
}
