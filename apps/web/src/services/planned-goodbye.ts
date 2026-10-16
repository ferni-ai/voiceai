/**
 * Planned Goodbye
 *
 * Ferni may end a call only after a planned goodbye: Ferni said goodbye
 * (`goodbye_complete`, `idle_after_goodbye`), the caller asked to end it
 * (`user_request`), or Ferni chose to hang up (`agent_exit`).
 *
 * Any other `conversation_end` is Ferni dropping off, not a goodbye: silence
 * (`idle_timeout`), repeated failures (`graceful_exit_failures`), or a reason
 * this app doesn't know. With call wrap-up on, the call stays up and the
 * reconnect prompt (#1328, agent-drop-watch.ts) offers Reconnect or End call.
 * Wrap-up turns that prompt on, whatever its own flag says, so no other end
 * can leave the caller in a dead room. With wrap-up off, every
 * `conversation_end` ends the call, as before.
 *
 * @module services/planned-goodbye
 */

import { isAgentDropPromptOn } from '../config/agent-drop-prompt-flag.js';
import { isCallWrapUpEnabled } from '../config/call-wrap-up-flag.js';

export const PLANNED_GOODBYE_REASONS: readonly string[] = [
  'goodbye_complete',
  'idle_after_goodbye',
  'user_request',
  'agent_exit',
];

export function isPlannedGoodbye(reason: unknown): boolean {
  return typeof reason === 'string' && PLANNED_GOODBYE_REASONS.includes(reason);
}

/** Whether a `conversation_end` with this reason ends the call. */
export function conversationEndEndsCall(reason: unknown): boolean {
  return !isCallWrapUpEnabled() || isPlannedGoodbye(reason);
}

/** The reconnect prompt runs on its own flag, and always with wrap-up. */
export function reconnectPromptOn(): boolean {
  return isAgentDropPromptOn() || isCallWrapUpEnabled();
}
