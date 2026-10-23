/**
 * Whether a caller line said as a call ends carries risk beyond the goodbye
 * (#2291). A crisis farewell often ends on an ordinary "bye": "I won't be here
 * tomorrow. Bye.", "tell my mom I love her. bye", "I'm sorry for everything.
 * goodbye". None of those may end a call as a sign-off, and each reopens it
 * as a crisis hold (wrap-up-window.ts), whatever the crisis read later says.
 *
 * Checked, on the accent-folded line: the crisis patterns (crisis-guard.ts
 * detectCrisis), farewell and last-request shapes, and the risk content of
 * the line with its goodbye clauses and words taken out (crisis-agreement.ts
 * hasRiskContent flags "bye", "soon", "sleep" and "done" on their own).
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
    // Accent folding stopped "adiós para siempre" (goodbye forever) reading as risk by its accent
    String.raw`\bpara siempre\b`,
  ].join('|'),
  'i'
);

/** The goodbye words themselves, which hasRiskContent counts as risk on their own ("bye"). */
const GOODBYE_WORDS =
  /\b(?:good ?bye|bye(?: bye)?|farewell|take care|love you|good ?night|night|see (?:you|ya)(?: later| soon)?)\b/gi;

/**
 * Goodbye and pleasantry phrases. A clause made only of these is taken out
 * before hasRiskContent runs, which flags "soon", "sleep" and "done" on their
 * own: "talk soon", "good night, sleep well", "bye, I'm done for today".
 * Only whole clauses: "I'm done. bye" and "I'm done with all of it, goodbye"
 * stay risk.
 */
const PLEASANTRIES = new Set(
  [
    ...['bye', 'bye bye', 'goodbye', 'good bye', 'take care', 'love you', 'love ya', 'later'],
    ...['good night', 'goodnight', 'night', 'night night', 'sweet dreams', 'sleep well'],
    ...['sleep tight', 'catch you later', 'you too', 'same to you', 'have a good one'],
    ...['have a good night', 'have a good day', 'have a good evening', 'have a good weekend'],
    ...['thanks', 'thank you', 'thanks so much', 'thank you so much', 'gracias', 'muchas gracias'],
    ...['adios', 'ciao', 'cheers', 'ok', 'okay', 'alright', 'all right', 'so', 'well', 'yeah'],
    ...['yep', 'cool', 'great', 'perfect', 'anyway', 'now', 'then', 'ferni'],
    ...['talk soon', 'talk later', 'talk tomorrow', 'talk to you soon', 'talk to you later'],
    ...['talk to you tomorrow', 'see you', 'see ya', 'see you soon', 'see you later'],
    ...['see you tomorrow', "i'm done for today", "i'm done for tonight", "i'm done for the day"],
    ...['im done for today', 'im done for tonight', 'im done for the day'],
  ]
    .map((p) => p.split(' '))
    .map((words) => words.join(' '))
);
const MAX_PLEASANTRY_WORDS = 5;

/** The clause is made only of goodbye and pleasantry phrases. */
function pleasantryClause(clause: string): boolean {
  const words = clause.split(' ').filter(Boolean);
  if (words.length === 0) return false;
  for (let i = 0; i < words.length;) {
    let len = Math.min(MAX_PLEASANTRY_WORDS, words.length - i);
    while (len > 0 && !PLEASANTRIES.has(words.slice(i, i + len).join(' '))) len--;
    if (len === 0) return false;
    i += len;
  }
  return true;
}

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

/** The line without its hang-up asks and its goodbye clauses, clause by clause. */
function withoutGoodbyeClauses(line: string): string {
  return line
    .split(/[.!?,;:]+/)
    .filter((clause) => {
      const plain = clause
        .toLowerCase()
        .replace(/[^a-z0-9' ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return !HANG_UP_CLAUSE.test(plain) && !pleasantryClause(plain);
    })
    .join(' ');
}

/** Accents folded ("adiós" is "adios"), so hasRiskContent never flags a letter for its accent. */
const fold = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[’‘]/g, "'");

export function farewellRisk(text: string): boolean {
  const line = fold(text);
  const crisis = detectCrisis(line);
  if (crisis.isCrisis || crisis.severity > 0.3) return true;
  if (FAREWELL_SHAPE.test(line)) return true;
  const rest = withoutGoodbyeClauses(line)
    .replace(GOODBYE_WORDS, ' ')
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .trim();
  return rest.length > 0 && hasRiskContent(rest);
}
