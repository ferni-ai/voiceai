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

/** The goodbye words themselves, which hasRiskContent counts as risk on their own. */
const GOODBYE_WORDS =
  /\b(?:good ?bye|bye(?: bye)?|farewell|take care|love you|good ?night|night|see (?:you|ya)(?: later| soon)?)\b/gi;

export function farewellRisk(text: string): boolean {
  const line = text.replace(/[’‘]/g, "'");
  const crisis = detectCrisis(line);
  if (crisis.isCrisis || crisis.severity > 0.3) return true;
  if (FAREWELL_SHAPE.test(line)) return true;
  const rest = line
    .replace(GOODBYE_WORDS, ' ')
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .trim();
  return rest.length > 0 && hasRiskContent(rest);
}
