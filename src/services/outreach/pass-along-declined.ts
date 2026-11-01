/**
 * The person Ferni called said no to having what they share passed along.
 *
 * Every call script asks ("Just so you know, I'll pass along what you tell me
 * to Riley. Is that okay?", scripts/*: passAlongScript) and tells the model
 * that a no is fine: it still gives them the member's message and doesn't
 * press. The member then hears only that they asked for nothing to be passed
 * along: no summary, no message and no action items are kept. A crisis read
 * on their words still reaches the member, as Ferni's own line (#2861).
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

/** True when their first reply after Ferni's pass-along question is a no. */
export function passAlongDeclined(turns: readonly CallTranscriptTurn[]): boolean {
  const asked = turns.findIndex((t) => t.role === 'agent' && ASKED.test(t.content));
  if (asked < 0) return false;
  const answer = turns.slice(asked + 1).find((t) => t.role === 'recipient');
  return answer !== undefined && SAID_NO.test(answer.content.replace(/[‘’]/g, "'"));
}

/** What the member hears when they said no: that they did, and nothing they said. */
export function passAlongDeclinedOutcome(
  callId: string,
  name: string,
  heard: readonly string[]
): CallOutcome {
  const crisis = heard.some(crisisRead) || crisisRead(heard.join(' '));
  const said = `I reached ${name}. They asked me not to pass anything along from the call, so that's all I can share.`;
  return {
    callId,
    status: 'completed',
    objectiveAchieved: false,
    outcome: crisis ? `${said} ${crisisCallerLine(name)}` : said,
  };
}
