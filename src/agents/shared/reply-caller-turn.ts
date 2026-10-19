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
 * @module agents/shared/reply-caller-turn
 */

import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';

interface ChatItemView {
  type: string;
  role?: string;
  textContent?: string;
}

/** Per agent: the caller's words the reply being generated answers ('' = none). */
const byAgent = new WeakMap<object, string>();

/** A note the turn machinery pushed into the chat as a user message, not something the caller said. */
const isNote = (text: string): boolean => text.startsWith(TURN_CONTEXT_HEADER);

/** The caller's messages since Ferni last spoke, joined; '' when the context ends on Ferni's line. */
export function callerWordsAnswered(items: readonly ChatItemView[]): string {
  const said: string[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item?.type !== 'message') continue;
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
 * llmNode ran (callerTurnFresh), else the fallback (userData.lastUserMessage).
 */
export function replyCallerTurnFields(
  agent: object,
  fallback: unknown
): { userRequest?: string; callerTurnFresh: boolean } {
  const noted = byAgent.get(agent);
  if (noted !== undefined) return { userRequest: noted || undefined, callerTurnFresh: true };
  return {
    userRequest: typeof fallback === 'string' ? fallback : undefined,
    callerTurnFresh: false,
  };
}
