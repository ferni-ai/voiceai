/**
 * Whether a caller line said as a call ends carries risk beyond the goodbye
 * (#2291). A crisis farewell often ends on an ordinary "bye": "I won't be here
 * tomorrow. Bye.", "tell my mom I love her. bye", "I'm sorry for everything.
 * goodbye". None of those may end a call as a sign-off, and each reopens it
 * as a crisis hold (wrap-up-window.ts), whatever the crisis read later says.
 *
 * Checked: the crisis patterns (crisis-guard.ts detectCrisis), the risk
 * content of the line with its goodbye words taken out (crisis-agreement.ts
 * hasRiskContent flags "bye" itself), and farewell and last-request shapes.
 *
 * @module agents/shared/farewell-risk
 */
import { hasRiskContent } from '../../services/safety/crisis-agreement.js';
import { detectCrisis } from '../../services/safety/crisis-guard.js';

/** Farewell and last-request shapes: a message passed on, an apology for everything, not being here. */
const FAREWELL_SHAPE = new RegExp(
  [
    String.raw`\bsorry for (?:everything|all of it|all of this|being)\b`,
    String.raw`\bforgive me\b`,
    String.raw`\btell (?:\w+ ){0,3}(?:that )?i (?:love|loved|am sorry|'m sorry)\b`,
    String.raw`\b(?:won'?t|will not|wont|not going to|never going to|gonna not) be (?:here|around)\b`,
    String.raw`\bthank(?:s| you) for everything\b`,
    String.raw`\btake care of (?:my|the|him|her|them)\b`,
    String.raw`\bremember me\b`,
    String.raw`\b(?:this is|it'?s) (?:my )?(?:last|the last|goodbye)\b`,
    String.raw`\blast (?:time|call|goodbye|thing)\b`,
  ].join('|'),
  'i'
);

/** The goodbye words themselves, which hasRiskContent counts as risk on their own ("bye"). */
const GOODBYE_WORDS =
  /\b(?:good ?bye|bye(?: bye)?|farewell|take care|love you|good ?night|night|see (?:you|ya)(?: later| soon)?)\b/gi;

/**
 * A whole clause that only asks Ferni to end the call, in the HANG_UPS forms
 * call-farewell.ts recognises ("you can hang up", "I said hang up now"),
 * followed by nothing but now / please / the phone / the call. hasRiskContent
 * counts "hang" as risk, so only these clauses are taken out before it runs:
 * "hang up on life", "hang up myself", "hang up from the ceiling" and
 * "hang up by my neck" stay risk.
 */
const HANG_UP_CLAUSE =
  /^(?:(?:ok|okay|alright|all right|so|well|yeah|just|please|i said|go ahead and)\s+)*(?:you\s+(?:can\s+|need to\s+|have to\s+)?)?(?:hang up|end the call)(?:\s+(?:now|right now|please|the phone|the call))*$/;

/** The line without its hang-up asks, clause by clause. */
function withoutHangUpAsks(line: string): string {
  return line
    .split(/[.!?,;:]+/)
    .filter((clause) => !HANG_UP_CLAUSE.test(clause.trim().toLowerCase().replace(/\s+/g, ' ')))
    .join(' ');
}

export function farewellRisk(text: string): boolean {
  const line = text.replace(/[’‘]/g, "'");
  const crisis = detectCrisis(line);
  if (crisis.isCrisis || crisis.severity > 0.3) return true;
  if (FAREWELL_SHAPE.test(line)) return true;
  const rest = withoutHangUpAsks(line)
    .replace(GOODBYE_WORDS, ' ')
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .trim();
  return rest.length > 0 && hasRiskContent(rest);
}
