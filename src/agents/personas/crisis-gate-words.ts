/**
 * What the reply gate reads from the request: the caller's words, the call's
 * lines, and the call's session id (crisis-gate.ts).
 *
 * @module CrisisGateWords
 */

import type { llm } from '@livekit/agents';
import type { AdjudicatorLine } from '../../services/safety/crisis-adjudicator.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';
import { isAcknowledgementOnly } from '../voice-agent/agent-reply-recorder.js';

interface MessageView {
  type?: string;
  role?: string;
  textContent?: string;
}

/**
 * The caller's words this reply answers, their earlier messages (oldest
 * first), and what Ferni said just before: the line those words answer.
 */
export function callerWords(chatCtx: llm.ChatContext): {
  latest: string;
  earlier: string[];
  companion?: string;
  /** All of Ferni's lines since the caller's earlier words (a tool follow-up comes last). */
  ferni: string[];
} {
  const said: string[] = [];
  const latest: string[] = [];
  const ferni: string[] = [];
  let companion: string | undefined;
  let answering = true;
  for (let i = chatCtx.items.length - 1; i >= 0; i--) {
    const item = chatCtx.items[i] as MessageView;
    if (item.type !== 'message') continue;
    if (item.role === 'assistant') {
      const line = item.textContent?.trim() || undefined;
      if (answering) companion = line;
      if (line && said.length === 0 && !isAcknowledgementOnly(line)) ferni.unshift(line);
      answering = false;
      continue;
    }
    const text = item.textContent?.trim();
    if (item.role !== 'user' || !text || text.startsWith(TURN_CONTEXT_HEADER)) continue;
    (answering ? latest : said).unshift(text);
  }
  return { latest: latest.join(' '), earlier: said, companion, ferni };
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
