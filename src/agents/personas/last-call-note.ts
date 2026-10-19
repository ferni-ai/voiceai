/**
 * CONVERSATION_CARRYOVER=on: one line in the per-turn reminder (turn-request.ts)
 * about the caller's last call, read at session start from what that call left
 * (services/social/conversation-carryover.ts): how they seemed, if it was
 * recent, and what you talked about.
 *
 * Only on the first few replies, the way a friend picks up where you left
 * off and then follows the conversation that's actually happening. Never
 * with crisis guidance.
 *
 * @module agents/personas/last-call-note
 */

import type { llm } from '@livekit/agents';

import type { Env } from '../../config/env-flag.js';
import {
  conversationCarryoverEnabled,
  restoredCarryover,
  type RestoredCarryover,
} from '../../services/social/conversation-carryover.js';

/** Ferni's replies (the greeting counts) during which the last call is mentioned. */
export const LAST_CALL_REPLIES = 3;

const MOOD_WORD: Record<string, string> = {
  sad: 'low',
  anxious: 'anxious',
  frustrated: 'frustrated',
  confused: 'unsure about things',
  happy: 'in good spirits',
  excited: 'excited',
  grateful: 'in good spirits',
  calm: 'settled',
};

function when(ageDays: number): string {
  if (ageDays === 0) return 'earlier today';
  if (ageDays === 1) return 'yesterday';
  if (ageDays < 7) return 'a few days ago';
  return 'a week or two ago';
}

function list(items: string[]): string {
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** The note for a restored carryover; '' when there is nothing to say. */
export function lastCallText(carry: RestoredCarryover): string {
  const parts: string[] = [];
  const emotion = carry.mood?.emotions.at(-1);
  const mood = emotion ? MOOD_WORD[emotion] : undefined;
  if (mood) parts.push(`they seemed ${mood}`);
  if (carry.topics.length > 0) parts.push(`you talked about ${list(carry.topics.slice(-3))}`);
  if (carry.circleBack.length > 0)
    parts.push(`you meant to come back to ${list(carry.circleBack)}`);
  if (parts.length === 0) return '';
  return (
    `On your last call with them (${when(carry.ageDays)}), ${list(parts)}. ` +
    "If it fits, check in on it the way a friend would, in your own words. Don't open by listing it, and let it go if they're on something else."
  );
}

/** The last-call note for this reply, or '' (flag off, nothing restored, or past the first replies). */
export function lastCallNote(
  chatCtx: llm.ChatContext,
  session: object,
  careful: boolean,
  env: Env = process.env
): string {
  if (careful || !conversationCarryoverEnabled(env)) return '';
  const userData = (session as { userData?: { services?: { sessionId?: string } } }).userData;
  const carry = restoredCarryover(userData?.services?.sessionId);
  if (!carry) return '';
  const replies = chatCtx.items.filter((i) => i.type === 'message' && i.role === 'assistant');
  return replies.length < LAST_CALL_REPLIES ? lastCallText(carry) : '';
}
