/**
 * Readers of a reply's chat context for the crisis gate (crisis-gate.ts), and
 * its fixed-text reply, moved out of it unchanged so it stays under the
 * 500-line limit.
 *
 * @module agents/personas/crisis-gate-words
 */

import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import type { AdjudicatorLine } from '../../services/safety/crisis-adjudicator.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';

interface MessageView {
  type?: string;
  role?: string;
  textContent?: string;
}

/** The call's recent lines, oldest first, marked by speaker (crisis-adjudicator.ts trims them). */
export function callTranscript(chatCtx: llm.ChatContext): AdjudicatorLine[] {
  const lines: AdjudicatorLine[] = [];
  for (const raw of chatCtx.items) {
    const item = raw as MessageView;
    const text = item.textContent?.trim();
    if (item.type !== 'message' || !text) continue;
    if (item.role === 'assistant') lines.push({ speaker: 'ferni', text });
    else if (item.role === 'user' && !text.startsWith(TURN_CONTEXT_HEADER))
      lines.push({ speaker: 'caller', text });
  }
  return lines;
}

/** The call's session id, which the reply gate and the turn pipeline share. */
export function sessionScope(userData: unknown): string | undefined {
  return (
    (userData as { services?: { sessionId?: string } } | undefined)?.services?.sessionId ||
    undefined
  );
}

/** The caller's userId, when the session knows it (MINOR_CARE's userHeld follows it). */
export const callerUserId = (userData: unknown): string | undefined =>
  (userData as { userId?: string } | undefined)?.userId || undefined;

/** A reply stream that speaks one fixed text. */
export function textReply(text: string): ReadableStream<llm.ChatChunk | string | object> {
  return new ReadableStream<llm.ChatChunk | string | object>({
    start(controller) {
      controller.enqueue(text);
      controller.close();
    },
  });
}
