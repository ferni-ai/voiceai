/**
 * Whether a caller line said as a call ends carries risk beyond the goodbye
 * (#2291). A crisis farewell often ends on an ordinary "bye": "I won't be here
 * tomorrow. Bye.", "tell my mom I love her. bye", "I'm sorry for everything.
 * goodbye". None of those may end a call as a sign-off, and each reopens it
 * as a crisis hold (wrap-up-window.ts), whatever the crisis read later says.
 *
 * Checked: the crisis patterns (crisis-guard.ts detectCrisis), farewell and
 * last-request shapes, and the risk content of the line with its whole
 * goodbye clauses and goodbye words taken out (crisis-agreement.ts
 * hasRiskContent flags "bye", "soon", "sleep" and "done" on their own).
 * Accents are folded only to recognise goodbye clauses ("adiós"); anything
 * left in another script is risk, as hasRiskContent fails closed on it.
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
    // Unambiguous finality after a goodbye (#2523): these escalate even over a clean read
    String.raw`\b(?:won'?t|will not|never|not going to|don'?t want to) wake(?: up)?\b`,
    String.raw`\b(?:nothing|none of (?:this|it)) matters?\b|\bdoes(?:n'?t| not) matter anymore\b`,
    String.raw`\b(?:go|gonna|going to|about to|finally) do it\b`,
    String.raw`\btake care of (?:\w+ ){1,3}for me\b`,
    String.raw`\bit'?s (?:all )?over for me\b`,
  ].join('|'),
  'i'
);

/**
 * Benign clauses that carry a hold-only word ("forever", "for life", "over")
 * and turn up in ordinary goodbyes. Only these WHOLE clauses are taken out
 * before hasRiskContent runs; every other hold-only word stays in the text for
 * the risk check ("I'm leaving forever. bye", "it's over for me. bye"). "never"
 * and "it's time" are not risk words to hasRiskContent, so "bye! never." and
 * "okay, it's time. bye" need no entry. A line with any of them besides its
 * goodbye is still no clean sign-off: it waits for the turn's crisis read
 * (Rule 1, wrap-up-window.ts), and a clean read ends it.
 */
const BENIGN_CLAUSES = new Set(['love you forever', 'friends for life', "the game's over"]);

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

/** Accents folded ("adiós" is "adios"): only to MATCH goodbye and pleasantry clauses. */
const fold = (text: string): string => text.normalize('NFKD').replace(/\p{M}+/gu, '');

/** A letter outside a-z, in any script ("ó", "д", "さ"), or a combining mark left over. */
const NON_ENGLISH_LETTER = /[^\P{L}a-zA-Z]|\p{M}/u;

/**
 * The only symbols a plain goodbye may carry: warm or neutral ones ("bye 🙂",
 * "love you ❤️", "bye :)"), with skin tones, variation selectors and joiners.
 */
const WARM_SYMBOLS =
  /🙂|😊|😀|😄|👋|❤|♥|💕|😘|🥰|🤗|👍|✌|🙏|\p{Emoji_Modifier}|\uFE0E|\uFE0F|\u200D|(?<![\p{L}\p{N}])(?::-?\)|:-?D|<3)(?![\p{L}\p{N}])/gu;

/**
 * Any other emoji, or a sad emoticon (":(", ":'(", "D:", "</3"), is never part of a plain goodbye.
 * The emoticon part also reads the "://" of a URL as a sad face; a URL in a spoken goodbye
 * is rare, and the error is on the safe side (the call stays open), so that is accepted.
 */
const OTHER_SYMBOL =
  /\p{Extended_Pictographic}|[:;=]'?-?[([\/\\|{<@]|(?<![\p{L}\p{N}])D-?:|<\/3|;_;/u;

/** The text with its warm symbols taken out (call-farewell.ts matches goodbyes on this). */
export function stripWarmSymbols(text: string): string {
  return text.replace(WARM_SYMBOLS, ' ');
}

/**
 * The ORIGINAL line without its whole hang-up-ask and goodbye clauses. A
 * clause is matched accent-folded, with every letter kept (any script), so a
 * clause in another script never looks like a pleasantry; an empty clause is
 * not one either.
 */
const plainOf = (clause: string): string =>
  fold(clause)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function goodbyeClause(clause: string): boolean {
  const plain = plainOf(clause);
  return !!plain && (HANG_UP_CLAUSE.test(plain) || pleasantryClause(plain));
}

const clausesOf = (line: string): string[] => line.split(/[.!?,;:、，。！？]+/);

function withoutGoodbyeClauses(line: string): string {
  return clausesOf(line)
    .filter((clause) => !goodbyeClause(clause) && !BENIGN_CLAUSES.has(plainOf(clause)))
    .join(' ');
}

/**
 * The line has a whole goodbye clause ("thanks so much, that helped. bye"). When
 * it also says more, it is not a clean sign-off: the call waits for the turn's
 * crisis read (wrap-up-window.ts) instead of ending on the goodbye.
 */
export function hasGoodbyeClause(text: string): boolean {
  return clausesOf(stripWarmSymbols(text.normalize('NFC').replace(/[’‘]/g, "'"))).some(
    goodbyeClause
  );
}

export function farewellRisk(text: string): boolean {
  // Composed first: "adiós" typed as "o" + a combining accent reads as "adiós"
  const line = text.normalize('NFC').replace(/[’‘]/g, "'");
  const warm = stripWarmSymbols(line);
  if (OTHER_SYMBOL.test(warm)) return true; // "bye 😢", "bye 🪢", "bye :("
  const crisis = detectCrisis(line);
  if (crisis.isCrisis || crisis.severity > 0.3) return true;
  if (FAREWELL_SHAPE.test(fold(line))) return true;
  const rest = withoutGoodbyeClauses(warm)
    .replace(GOODBYE_WORDS, ' ')
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .trim();
  if (!rest) return false;
  // Fails closed on what it can't read: a line with letters outside English is plain
  // only when every clause is a goodbye ("gracias, adiós"), never "adiós, ya no quiero vivir"
  if (NON_ENGLISH_LETTER.test(warm)) return true;
  return hasRiskContent(rest);
}
