/**
 * What the reply gate reads from the request: the caller's words, the call's
 * lines, and the call's session id (crisis-gate.ts); and the crisis script the caller hears.
 *
 * @module CrisisGateWords
 */

import type { llm } from '@livekit/agents';
import type { AdjudicatorLine } from '../../services/safety/crisis-adjudicator.js';
import { MAX_EARLIER_MESSAGES } from '../../services/safety/index.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';
import { isAcknowledgementOnly } from '../voice-agent/agent-reply-recorder.js';
import { minorHarmScript } from '../../services/safety/minor-abuse-disclosure.js'; // MINOR_ABUSE_DISCLOSURE
import { minorCrisisScript } from '../../utils/minor-crisis-care.js'; // MINOR_CRISIS_CARE

interface MessageView {
  type?: string;
  role?: string;
  textContent?: string;
  interrupted?: boolean;
  /** ms; a caller message's is when they started speaking (LiveKit agent_activity). */
  createdAt?: number;
  /** seconds; when Ferni's reply stopped playing. */
  metrics?: { stoppedSpeakingAt?: number };
}

/**
 * A reply of Ferni's the caller's next words did not answer: cut off, or still playing when
 * they started (a paused and resumed reply sits between the halves of their turn).
 */
function spokenOver(reply: MessageView, nextCallerAt: number | undefined): boolean {
  if (reply.interrupted) return true;
  const stopped = reply.metrics?.stoppedSpeakingAt;
  return stopped !== undefined && nextCallerAt !== undefined && nextCallerAt < stopped * 1000;
}

/**
 * The caller's words this reply answers, their earlier messages (oldest
 * first), and what Ferni said just before: the line those words answer.
 *
 * `sinceCompleted` (CRISIS_GATE_TURN_READS): the words run back to Ferni's last completed reply,
 * across any reply the caller spoke over, so a turn split by a paused reply is read whole. At
 * most the classifier's line cap, newest kept (the latest line always); older lines are earlier
 * context, and Ferni's line those words answered is then unknown.
 */
export function callerWords(
  chatCtx: llm.ChatContext,
  { sinceCompleted = false }: { sinceCompleted?: boolean } = {}
): {
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
  let firstCallerAt: number | undefined; // the earliest of the words being answered so far
  let joined = false; // a spoken-over reply was read through
  for (let i = chatCtx.items.length - 1; i >= 0; i--) {
    const item = chatCtx.items[i] as MessageView;
    if (item.type !== 'message') continue;
    if (item.role === 'assistant') {
      if (sinceCompleted && answering && latest.length && spokenOver(item, firstCallerAt)) {
        joined = true;
        continue;
      }
      const line = item.textContent?.trim() || undefined;
      if (answering) companion = line;
      if (line && said.length === 0 && !isAcknowledgementOnly(line)) ferni.unshift(line);
      answering = false;
      continue;
    }
    const text = item.textContent?.trim();
    if (item.role !== 'user' || !text || text.startsWith(TURN_CONTEXT_HEADER)) continue;
    if (answering && joined && latest.length >= MAX_EARLIER_MESSAGES) answering = false;
    if (answering) firstCallerAt = item.createdAt;
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

/**
 * The crisis script as the caller hears it (gatedReply).
 * MINOR_CRISIS_CARE=on: a caller who sounds under 18 also hears the youth line; the script stays.
 * MINOR_ABUSE_DISCLOSURE=on: one who told of harm this turn hears the child-safety lines last.
 */
export function crisisScriptFor(
  text: string,
  chatCtx: llm.ChatContext,
  risk: string | undefined,
  env: Record<string, string | undefined>
): string {
  const heard = callerWords(chatCtx);
  return minorHarmScript(
    minorCrisisScript(text, risk, heard.latest, chatCtx.items),
    risk,
    heard,
    env
  );
}
