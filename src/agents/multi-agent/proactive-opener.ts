/**
 * The opener of a call Ferni placed to its own user (PROACTIVE_REASON_OPENER): hi, their
 * name, and why Ferni called, from the outreach job's reason. Split from greeting-direction.ts.
 *
 * @module agents/multi-agent/proactive-opener
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { getDisplayName, isKnownId } from '../../personas/persona-ids.js';

/** The longest fact a greeting gets from the caller's history or a call's reason. */
export const MAX_TOPIC_CHARS = 160;

// A call Ferni placed to its own user opened "Hey Seth, how's your week been
// treating you?" (prod 2026-10-10): GREETING_DIRECTION says "they just called
// you", and why Ferni called ("Seth asked Ferni to give him a call...") reached
// only the main model's prompt, never the greeting.
export const PROACTIVE_GREETING_DIRECTION =
  'You phoned them and they just picked up. Open the way a friend who called does: hi and their name, then in a few words why you called, in your own words, using only the reason you are given. If the reason is something hard, say it gently and never name how they feel. If no reason is given, just say you were calling to check in; never make one up. Relaxed and low-key, one or two short sentences, no exclamation marks, do not list what you can do.';

/** Why Ferni placed a proactive call, from the outreach job's metadata. */
export interface ProactiveReason {
  triggerReason?: string;
  relatedCommitment?: { summary?: string };
  lastSessionSummary?: string;
}

/** The default the metadata parser fills in when the job gave no reason. */
const PLACEHOLDER_REASONS = new Set(['proactive check-in']);

/** PROACTIVE_REASON_OPENER=on: a proactive call's opener says why Ferni called. */
export function proactiveReasonOpenerEnabled(env: Env = process.env): boolean {
  return flagOn('PROACTIVE_REASON_OPENER', env);
}

/** The reasons the opener may give, as director facts. Empty when the job gave none. */
export function proactiveReasonFacts(reason: ProactiveReason): Record<string, string> {
  const facts: Record<string, string> = {};
  const why = reason.triggerReason?.trim();
  if (why && !PLACEHOLDER_REASONS.has(why.toLowerCase()))
    facts['why you called them'] = why.slice(0, MAX_TOPIC_CHARS);
  const commitment = reason.relatedCommitment?.summary?.trim();
  if (commitment) facts['something they said they would do'] = commitment.slice(0, MAX_TOPIC_CHARS);
  const last = reason.lastSessionSummary?.trim();
  if (last) facts['what you talked about last time'] = last.slice(0, MAX_TOPIC_CHARS);
  return facts;
}

/**
 * A call Ferni placed to its own user (PROACTIVE_REASON_OPENER on): its opener
 * waits for the phone to be picked up, like an on-behalf call's.
 */
export async function isProactiveCall(sessionId: string): Promise<boolean> {
  if (!proactiveReasonOpenerEnabled()) return false;
  const { isProactiveSession } =
    await import('../../intelligence/context-builders/external/proactive-session-context.js');
  return isProactiveSession(sessionId);
}

/** The understudy for a proactive call: says Ferni called, never guesses why. */
export function proactiveFallback(userName: string | undefined, personaId = 'ferni'): string {
  // Whoever placed the call: "call me" can ring with Alex (live-agent-call.ts), not just Ferni.
  const caller = isKnownId(personaId) ? getDisplayName(personaId) : 'Ferni';
  return `Hey${userName ? ` ${userName}` : ''}, it's ${caller}, just calling to check in.`;
}
