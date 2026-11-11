/**
 * A reply nobody asked for still ends on a caller turn that says so.
 *
 * Gemini refuses a request that ends on the model's own turn, so the SDK's
 * Google format (`@livekit/agents` llm/provider_format/google.js) appends a
 * user turn of "." to every request that does: each silence remark, late-night
 * presence line and handoff greeting. The model reads that "." as something
 * the caller said and answers it. Prod 2026-10-17, into a long silence:
 * "Sometimes a quiet dot is all the conversation we need." (and earlier
 * "Yeah, exactly." to nothing). Such a request now carries a caller turn that
 * says what actually happened, so the SDK adds no ".". Only the request sent
 * to the model changes; the saved history does not. CALLER_TURN_NOTE=off
 * restores the old request.
 *
 * @module agents/personas/caller-turn
 */

import type { llm } from '@livekit/agents';

import { flagOn, type Env } from '../../config/env-flag.js';
import { NO_NEW_WORDS_NOTE } from '../multi-agent/turn-context-header.js';

/** llmNode notes the caller's words each reply answers (reply-caller-turn.ts). */
export { noteReplyCallerTurn } from '../shared/reply-caller-turn.js';

/** The caller turn for a reply they didn't prompt. Bracketed like the other stage notes. */
export { NO_NEW_WORDS_NOTE };

const hasContent = (m: llm.ChatMessage): boolean =>
  m.content.some((c) => (typeof c === 'string' ? c.trim() !== '' : true));

/** Who the request ends on, as the Google format lays it out: the caller, the model, or a tool's result. */
type LastTurn = 'none' | 'caller' | 'model' | 'tool_result';

/**
 * As in the Google format, the first system message is the system prompt, a later one counts as
 * a caller turn, and a message with no content adds no turn.
 */
function lastTurn(items: readonly llm.ChatItem[]): LastTurn {
  let systemSeen = false;
  let last: LastTurn = 'none';
  for (const item of items) {
    if (item.type === 'function_call') last = 'model';
    else if (item.type === 'function_call_output') last = 'tool_result';
    else if (item.type === 'message') {
      const isSystem = item.role === 'system' || item.role === 'developer';
      const first = isSystem && !systemSeen;
      if (isSystem) systemSeen = true;
      if ((first && item.role === 'system') || !hasContent(item)) continue;
      last = item.role === 'assistant' ? 'model' : 'caller';
    }
  }
  return last;
}

/** True when the request ends on the model's turn: an assistant line or a tool call after the last caller turn. */
export function endsOnModelTurn(items: readonly llm.ChatItem[]): boolean {
  return lastTurn(items) === 'model';
}

/** True when the caller's turn is the last thing in the request: no model turn or tool result follows it. */
function endsOnCallerTurn(items: readonly llm.ChatItem[]): boolean {
  return lastTurn(items) === 'caller';
}

/** The request with a caller turn appended when it would end on the model's turn. */
export function withCallerTurn(chatCtx: llm.ChatContext, env: Env = process.env): llm.ChatContext {
  if (!flagOn('CALLER_TURN_NOTE', env) || !endsOnModelTurn(chatCtx.items)) return chatCtx;
  const ctx = chatCtx.copy();
  ctx.addMessage({ role: 'user', content: NO_NEW_WORDS_NOTE });
  return ctx;
}

/**
 * The request with a caller turn appended whenever the caller's turn isn't already last: it ends
 * on the model's turn (a tool call) or on a tool's result. Crisis guidance rides on the last caller
 * turn (crisis-gate.ts), so after a tool round it is read after the tool's output, never before.
 * Not behind CALLER_TURN_NOTE: crisis guidance is always the last thing the model reads.
 */
export function withTrailingCallerTurn(chatCtx: llm.ChatContext): llm.ChatContext {
  if (endsOnCallerTurn(chatCtx.items)) return chatCtx;
  const ctx = chatCtx.copy();
  ctx.addMessage({ role: 'user', content: NO_NEW_WORDS_NOTE });
  return ctx;
}
