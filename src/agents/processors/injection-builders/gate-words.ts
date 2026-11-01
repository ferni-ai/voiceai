/**
 * The caller's words the reply gate will score on this turn (CRISIS_LEXICAL_V2).
 *
 * The gate scores callerWords(request).latest (personas/crisis-gate-words.ts): every caller
 * message since Ferni's last line, joined. A turn hook gets the chat context before the SDK
 * adds the caller's new message (agent_activity: the hook gets a copy, the message is
 * inserted after), so the request is that context with the message added, unless it is
 * already the last caller line. The human-transfer note may defer to the gate only on
 * exactly these words (services/human-transfer/transfer-need.ts).
 *
 * @module agents/processors/injection-builders/gate-words
 */
import type { llm } from '@livekit/agents';
import { callerWords } from '../../personas/crisis-gate-words.js';

interface MessageView {
  type?: string;
  role?: string;
  textContent?: string;
}

/** The words the gate scores for this turn, from the turn's chat context and its new message. */
export function gateWordsFor(turnCtx: llm.ChatContext, newText: string): string {
  const users = turnCtx.items.filter(
    (i) => (i as MessageView).type === 'message' && (i as MessageView).role === 'user'
  );
  const last = (users.at(-1) as MessageView | undefined)?.textContent?.trim();
  if (last === newText.trim()) return callerWords(turnCtx).latest;
  const request = turnCtx.copy();
  request.addMessage({ role: 'user', content: newText });
  return callerWords(request).latest;
}
