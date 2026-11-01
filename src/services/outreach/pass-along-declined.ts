/**
 * The person Ferni called said no to having what they share passed along.
 *
 * Every call script asks ("Just so you know, I'll pass along what you tell me
 * to Riley. Is that okay?", scripts/*: passAlongScript) and tells the model
 * that a no is fine: it still gives them the member's message and doesn't
 * press. A no counts when it starts their first reply to that question, or
 * when they take it back at any point ("off the record", "don't tell him").
 * The member then hears only that they asked for nothing to be passed along:
 * no summary, no message and no action items are kept, and their words never
 * go to the summary model. A crisis read on their words still reaches the
 * member, as Ferni's own line (#2861).
 *
 * @module services/outreach/pass-along-declined
 */

import type { CallOutcome } from '../../tools/domains/telephony/types.js';
import type { CallTranscriptTurn } from './call-transcript-intelligence.js';
import { crisisCallerLine, crisisRead } from './caller-text.js';

/** Ferni's pass-along question, however the model words it: "pass ... along ... okay?". */
const ASKED = /\bpass\b[^.?!]*\b(?:along|on)\b[^?]*\b(?:okay|ok|alright|all right|fine)\b[^?]*\?/i;
/** Their answer starts with a no. "No problem" and "no worries" are a yes. */
const SAID_NO =
  /^\W*(?:(?:oh|um+|uh+|well|hmm+|actually)\W+)*(?:no\b(?!\W*(?:problem|worries|prob)\b)|nope\b|nah\b|please don't|don't\b|i'd (?:rather|prefer) (?:you )?(?:not|didn't)|not really\b|keep (?:this|it) between us)/i;
/** Anywhere in the call, they take it back: "don't pass that on", "keep this between us". */
const WITHDRAWN =
  /\b(?:don't|do not|dont) (?:pass (?:that|this|it|any of (?:that|this)) (?:on|along)|tell (?:him|her|them|anyone|anybody)\b|share (?:that|this|it)\b|mention (?:that|this|it)\b|repeat (?:that|this|it)\b)|\b(?:keep (?:this|that|it)|just) between (?:us|you and me)\b|\boff the record\b|\bi'd (?:rather|prefer) you (?:didn't|not)\b/i;

const straight = (text: string): string => text.replace(/[\u2018\u2019]/g, "'");

/** True when their first reply to Ferni's pass-along question is a no, or they take it back later. */
export function passAlongDeclined(turns: readonly CallTranscriptTurn[]): boolean {
  const heard = turns.filter((t) => t.role === 'recipient').map((t) => straight(t.content));
  if (heard.some((h) => WITHDRAWN.test(h))) return true;
  const asked = turns.findIndex((t) => t.role === 'agent' && ASKED.test(t.content));
  if (asked < 0) return false;
  const answer = turns.slice(asked + 1).find((t) => t.role === 'recipient');
  return answer !== undefined && SAID_NO.test(straight(answer.content));
}

/** What the member hears when they said no: that they did, and nothing they said. */
export function passAlongDeclinedOutcome(
  callId: string,
  name: string,
  heard: readonly string[],
  optedOut = false
): CallOutcome {
  const crisis = heard.some(crisisRead) || crisisRead(heard.join(' '));
  const asked = `I reached ${name}. They asked me not to pass anything along from the call`;
  const said = optedOut
    ? `${asked}, and not to call them again, so I won't. That's all I can share.`
    : `${asked}, so that's all I can share.`;
  return {
    callId,
    status: 'completed',
    objectiveAchieved: false,
    outcome: crisis ? `${said} ${crisisCallerLine(name)}` : said,
  };
}
