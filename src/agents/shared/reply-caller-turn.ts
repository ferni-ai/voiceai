/**
 * The caller's words a reply answers, read from that reply's own chat context.
 *
 * The TTS context's userRequest came from userData.lastUserMessage, which two
 * places write: the final-transcript handler (one STT segment, not the whole
 * turn) and the turn processor, which now runs in the background
 * (turn-intelligence.ts) and can finish after the reply has started. With the
 * SDK's preemptive generation the reply can even start before the turn ends.
 * So a reply could be voiced against the previous turn's words: on dev
 * 2026-10-17 EMOTION_LIFT never provably fired on good-news calls.
 *
 * The SDK builds every reply's chat context with the caller's message in it
 * and hands it to llmNode before any text reaches ttsNode (agent_activity.js
 * _pipelineReplyTaskImpl: a TTS segment starts on the first LLM text). So
 * llmNode notes the caller's words since Ferni last spoke, and the TTS context
 * reads them back. A reply nobody prompted (its context ends on Ferni's own
 * line) answers no caller words.
 *
 * The reply after a tool step has no new caller message: its context is
 * [caller, "Let me check.", tool call, tool result] (agent_activity.js tool
 * reply). It answers the caller's words that started the step, so the step's
 * own lead-in is walked past; a reply that ended an earlier turn is not.
 *
 * The note is single-use: the reply's ttsNode reads it once (Ferni's llmNode
 * emits no flush sentinel, so one TTS segment per reply). session.say() goes
 * straight to ttsNode with no llmNode, so a greeting, goodbye or timer line
 * finds no note and reads lastUserMessage, not fresh, as before.
 *
 * @module agents/shared/reply-caller-turn
 */

import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';

interface ChatItemView {
  type: string;
  id?: string;
  role?: string;
  textContent?: string;
}

/** Per agent: the caller's words the reply being generated answers ('' = none). */
const byAgent = new WeakMap<object, string>();

/** A note the turn machinery pushed into the chat as a user message, not something the caller said. */
const isNote = (text: string): boolean => text.startsWith(TURN_CONTEXT_HEADER);

/** The generation a tool call came from: the SDK ids calls `${generation}/fnc_${n}`, its text `${generation}`. */
const generationOf = (callId: string): string => callId.split('/fnc_')[0] ?? callId;

/**
 * Walking back before any caller words: a tool call (its generation noted) or
 * that generation's own lead-in ("Let me check."), both part of the tool step.
 */
function inToolStep(item: ChatItemView, toolSteps: Set<string>): boolean {
  if (item.id === undefined) return false;
  if (item.type === 'function_call') {
    toolSteps.add(generationOf(item.id));
    return true;
  }
  return item.type === 'message' && item.role === 'assistant' && toolSteps.has(item.id);
}

/** The caller's messages since Ferni last spoke, joined; '' when the context ends on Ferni's line. */
export function callerWordsAnswered(items: readonly ChatItemView[]): string {
  const said: string[] = [];
  const toolSteps = new Set<string>(); // generations whose tool step the context ends in
  for (const item of [...items].reverse()) {
    if (said.length === 0 && inToolStep(item, toolSteps)) continue;
    if (item.type !== 'message') continue;
    if (item.role === 'assistant') break;
    const text = item.textContent?.trim();
    if (item.role === 'user' && text && !isNote(text)) said.unshift(text);
  }
  return said.join(' ');
}

/** llmNode: note the caller's words this reply answers. Returns `chatCtx` unchanged. */
export function noteReplyCallerTurn<T extends { items: readonly ChatItemView[] }>(
  agent: object,
  chatCtx: T
): T {
  byAgent.set(agent, callerWordsAnswered(chatCtx.items));
  return chatCtx;
}

/**
 * The TTS context's caller fields: the words noted for this agent's reply when
 * llmNode ran (callerTurnFresh), read once; else the fallback (userData.lastUserMessage).
 */
export function replyCallerTurnFields(
  agent: object,
  fallback: unknown
): { userRequest?: string; callerTurnFresh: boolean } {
  const noted = byAgent.get(agent);
  byAgent.delete(agent); // single-use: a say() line after this reply is not fresh
  if (noted !== undefined) return { userRequest: noted || undefined, callerTurnFresh: true };
  return {
    userRequest: typeof fallback === 'string' ? fallback : undefined,
    callerTurnFresh: false,
  };
}
