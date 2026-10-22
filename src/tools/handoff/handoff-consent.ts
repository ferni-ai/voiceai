/**
 * Hand a caller to a teammate only when they asked for it.
 *
 * Asked "What's Nvidia going to close at tomorrow?", Ferni answered "Let me
 * hand you off to Henry Caldwell." in 7 of 10 eval calls, with no answer of his
 * own first, and the arriving teammate opened with "Hey! What's up?", as if
 * the caller had rung a switchboard. The judge picked those handoffs as the
 * worst moment of the call (candor A/B on dev, 2026-10-12). A friend answers
 * you themselves, and passes the phone only if you want them to.
 *
 * So, with HANDOFF_ASK_FIRST=on, a handoff to a teammate goes ahead only when
 * the caller's own words ask for one: they name the teammate, ask to talk to
 * someone on the team, or say yes right after Ferni offered that teammate.
 * Otherwise the tool declines and tells the model to answer them itself.
 * Returning a caller to the coordinator is never held back.
 *
 * Reads the session's chat history, which is the conversation as spoken
 * (userData.recentMessages is never written).
 *
 * @module tools/handoff/handoff-consent
 */

import type { llm } from '@livekit/agents';
import { latestUserText } from '../retrieval/turn-tool-retrieval.js';
import type { Env } from '../../config/env-flag.js';
import { crisisGuidedTurn } from '../../services/safety/index.js';
import { aliasesInTransfer } from './transfer-aliases.js';
import { misheardTeammates, teammateHeardAs } from './teammate-names.js';

export function handoffAskFirstEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.HANDOFF_ASK_FIRST === 'on';
}

export type HandoffConsent = 'asked' | 'agreed' | 'none';

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether `text` names the teammate: any part of their name as a whole word
 * ("Johnny" does not name John), or a spelling speech-to-text writes for them
 * ("Can I talk to Naya?" is Nayan; see teammate-names.ts). With `aliases`, an
 * ordinary word that is the target of a transfer too ("talk to 9" may be
 * Nayan; transfer-aliases.ts, TRANSFER_NAME_ALIASES), unless `aliases.agentSaid`
 * or `text` holds 911 or 988.
 */
function names(
  text: string,
  agentName: string,
  aliases?: { env: Env; agentSaid: string }
): boolean {
  const byName = agentName
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .some((w) => new RegExp(`\\b${escape(w)}\\b`, 'i').test(text));
  if (byName) return true;
  const target = teammateHeardAs(agentName.split(/\s+/)[0] ?? '');
  if (target === null) return false;
  const heard = [
    ...misheardTeammates(text),
    ...(aliases ? aliasesInTransfer(text, aliases.env, aliases.agentSaid) : []),
  ];
  return heard.some((m) => m.id === target);
}

/**
 * "can I talk to your money guy", "put him on", "hand me over". Not "talk to
 * someone": "I need to talk to someone about my dad" wants Ferni, not a transfer.
 */
const ASKS_FOR_SOMEONE =
  /\b(talk|speak|chat)\s+(to|with)\s+(your|one of your|a teammate|the team)\b|\b(transfer|hand|pass|switch)\s+me\s+(over|off|to)\b|\bput\s+(them|him|her)\s+on\b/i;

/** A yes to an offer. A no anywhere in the reply wins ("yeah no", "sure, but not now"). */
const YES =
  /\b(yes|yeah|yep|yup|sure|ok|okay|please|absolutely|definitely|go ahead|sounds good|let'?s do it|why not|do it)\b/i;
const NO = /\b(no|nah|nope|not now|not really|don'?t|later|i'?m good)\b/i;

/** What Ferni said just before the caller's latest turn. */
function previousAgentText(chatCtx: llm.ChatContext): string {
  let seenUser = false;
  for (let i = chatCtx.items.length - 1; i >= 0; i--) {
    const item = chatCtx.items[i];
    if (item.type !== 'message') continue;
    if (item.role === 'user') seenUser = true;
    else if (item.role === 'assistant' && seenUser) return item.textContent ?? '';
  }
  return '';
}

/**
 * Whether the caller asked to talk to `agentName`, said yes to an offer of them,
 * or neither. `aliasEnv`: a transfer-only alias ("talk to 9") may count, read
 * with this env; never pass it on a call with crisis handling.
 */
export function handoffConsent(
  chatCtx: llm.ChatContext,
  agentName: string,
  aliasEnv?: Env
): HandoffConsent {
  const said = latestUserText(chatCtx) ?? '';
  const aliases = aliasEnv && { env: aliasEnv, agentSaid: previousAgentText(chatCtx) };
  if (names(said, agentName, aliases) || ASKS_FOR_SOMEONE.test(said)) return 'asked';
  if (YES.test(said) && !NO.test(said) && names(previousAgentText(chatCtx), agentName)) {
    return 'agreed';
  }
  return 'none';
}

/** The tool result when a handoff is held back: answer them yourself. */
export function heldHandoff(agentName: string): {
  unavailable: true;
  instruction: string;
} {
  const first = agentName.split(/\s+/)[0];
  return {
    unavailable: true,
    instruction:
      `Not transferred: they didn't ask for ${first}. Answer them yourself, in your own words, ` +
      `the way a friend would. If ${first} would really help, you can mention it once, casually, ` +
      `and transfer only if they say yes.`,
  };
}

/** The session's chat history from a tool's RunContext, if it has one. */
export function historyOf(runCtx: unknown): llm.ChatContext | undefined {
  const history = (runCtx as { session?: { history?: unknown } } | undefined)?.session?.history;
  return typeof history === 'object' && history !== null && 'items' in history
    ? (history as llm.ChatContext)
    : undefined;
}

/**
 * The handoff tool's gate, given the tool's RunContext. Null lets the handoff
 * run; otherwise it is the tool result to return instead.
 */
export function holdUnaskedHandoff(
  runCtx: unknown,
  agentName: string,
  toCoordinator: boolean,
  env: Record<string, string | undefined> = process.env
): ReturnType<typeof heldHandoff> | null {
  const chatCtx = historyOf(runCtx);
  if (!handoffAskFirstEnabled(env) || toCoordinator || !chatCtx) return null;
  // A transfer-only alias counts only on a call with no crisis handling (transfer-aliases.ts).
  const guided = crisisGuidedTurn((runCtx as { userData?: unknown } | undefined)?.userData);
  const consent = handoffConsent(chatCtx, agentName, guided ? undefined : env);
  return consent === 'none' ? heldHandoff(agentName) : null;
}
