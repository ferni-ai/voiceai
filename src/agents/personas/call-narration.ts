/**
 * Ferni never tells how a call he made went when nothing says it happened.
 *
 * Owner call 2026-10-18: Ferni opened on "how did that phone call with your mom
 * go?", the caller said "pretty good", and Ferni went on "we ended up talking
 * for nearly an hour". The call was still held for a better hour and had never
 * rung. The claim check (action-claims.ts) reads claims that a call is placed
 * or under way; this reads the next step, a story of how it went: "we talked
 * for an hour", "she told me…", "she said to tell you hi", "it rang out",
 * "nobody picked up", and "it went great" when the caller asked about the call.
 *
 * Such a sentence is dropped (action-claim-guard.ts) only when all hold:
 * - a call Ferni made or was asked to make is in play: a call tool ran on this
 *   call, or a recent line talks about a call with or to someone;
 * - no call result reached this conversation (a "Reported from Ferni's call"
 *   block, pending-call-results.ts);
 * - the caller isn't telling their own call ("I called her and we talked"):
 *   then Ferni is echoing them, which stands.
 *
 * @module agents/personas/call-narration
 */

import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';

/** What Ferni says in place of a story about a call no result has come back from. */
export const UNHEARD_LINE = "I don't actually know how that call went yet, I haven't heard back.";

const WHO = '(?:[Ss]he|[Hh]e|[Tt]hey|[Yy]our (?:\\w+ )?\\w+|[A-Z][a-z]+)';
/** Ferni's own story of how a call went, read on the whole sentence. */
const TOLD = [
  /\bwe (?:ended up |just |actually |really )?(?:talked|talking|chatted|chatting|spoke|caught up)\b/i,
  /\bi (?:talked|chatted|spoke|caught up) (?:to|with) (?:her|him|them|your \w+)\b/i,
  new RegExp(
    `\\b${WHO} (?:told me|said to me|asked me|thanked me|said to tell you|says hi|said hi)\\b`
  ),
  /\b(?:loved|was (?:so )?(?:happy|glad|thrilled) about) hearing from (?:me|us)\b/i,
  /\b(?:it|the call|the phone|her phone|his phone) (?:just )?(?:rang out|went (?:straight )?to voicemail)\b/i,
  /\b(?:no ?one|nobody) (?:picked up|answered)\b/i,
];
/** "It went great": a story only when the caller just asked how the call went. */
const WENT =
  /^(?:\W*(?:oh|so|yeah|well|honestly)\W+)*(?:it|the call|that call) went (?:really |so )?(?:great|well|fine|good|amazing|wonderfully|lovely)\b/i;
const ASKED_HOW =
  /\bhow(?:'d| did) (?:it|the|that)\b[^.?!]{0,40}\bgo\b|\bdid you (?:call|reach|talk to)\b/i;

/** A recent line about a call with or to someone ("that phone call with your mom"). */
const CALL_TALK =
  /\bphone call\b|\bcall (?:with|to) (?:your|her|him|them|my)\b|\bcall(?:ed|ing)? (?:your|my) \w+|\bhow(?:'d| did) (?:the|that) call\b/i;
/** The caller's own call: "I called my mom", "we talked for an hour", "she didn't pick up". */
const OWN_CALL =
  /\b(?:i|we) (?:called|rang|phoned|talked|spoke|chatted|caught up|facetimed)\b|\b(?:she|he|they) (?:said|told me|picked up|answered|didn't (?:pick up|answer))\b|\bwent (?:great|well|fine|good)\b/i;
const REPORTED = /\bReported from Ferni's call\b/;

interface Item {
  type?: string;
  role?: string;
  name?: string;
  textContent?: string;
  content?: unknown;
}

const textOf = (item: Item): string => {
  const text =
    item.textContent ??
    (Array.isArray(item.content)
      ? item.content.filter((part): part is string => typeof part === 'string').join(' ')
      : '');
  return text.replace(/[‘’]/g, "'");
};
/** The spoken line only: a per-turn reminder rides after a blank line (turn-style.ts). */
const spoken = (item: Item): string => {
  const first = textOf(item).split('\n')[0].trim();
  return first.startsWith(TURN_CONTEXT_HEADER) ? '' : first;
};

/**
 * Whether a story of how a call went must be dropped in this reply: a call is in
 * play, no result reached the conversation, and the caller isn't telling their own.
 */
export function callOutcomeUnheard(
  chatCtx: { items: readonly unknown[] },
  callToolRan: boolean
): { askedHow: boolean } | null {
  const items = chatCtx.items as readonly Item[];
  if (items.some((item) => REPORTED.test(textOf(item)))) return null;
  const lines = items.filter((item) => item.type === 'message' && item.role !== 'system');
  const recent = lines.slice(-4).map(spoken);
  if (!callToolRan && !recent.some((line) => CALL_TALK.test(line))) return null;
  const caller = lines
    .filter((item) => item.role === 'user')
    .slice(-3)
    .map(spoken);
  if (caller.some((line) => OWN_CALL.test(line))) return null;
  return { askedHow: ASKED_HOW.test(caller.at(-1) ?? '') || ASKED_HOW.test(recent.join(' ')) };
}

/** One sentence that tells how a call went, as if Ferni knew. */
export function narratesCallOutcome(sentence: string, askedHow: boolean): boolean {
  const text = sentence.replace(/[‘’]/g, "'").trim();
  if (text.includes('?')) return false;
  return TOLD.some((re) => re.test(text)) || (askedHow && WENT.test(text));
}
