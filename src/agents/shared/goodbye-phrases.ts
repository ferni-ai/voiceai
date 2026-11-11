/**
 * The goodbye words: whether a turn ends on the caller's goodbye or a "hang
 * up", signs off, or is leaving, and whether Ferni's reply says goodbye. The
 * farewell watcher (call-farewell.ts) decides on these whether a call ends, so
 * they are strict: whole words in a closing position. "okay bye" and "gotta
 * go, talk soon" are goodbyes; "goodbye to my old job" and "say bye to grandma
 * for me" are not.
 *
 * Moved out of call-farewell.ts unchanged, which re-exports these names, so
 * importers are unchanged.
 *
 * @module agents/shared/goodbye-phrases
 */
import { farewellRisk, stripWarmSymbols } from './farewell-risk.js';

/**
 * Caller goodbyes are matched on words, not one big regex. The regex this
 * replaced nested overlapping alternatives under `*` ("thank you" matched two
 * ways, "bye bye" three), so a turn like "thank you thank you ... x" took
 * exponential time on a live transcript. Here every check is a linear pass
 * over at most MAX_CALLER_CHARS of text.
 */
export const MAX_CALLER_CHARS = 200;
const MAX_FERNI_CHARS = 300;

/** Every way to fill a phrase template: [["see"], ["ya", "you"]] -> "see ya", "see you". */
function expand(...slots: string[][]): string[] {
  return slots.reduce<string[]>(
    (acc, options) => acc.flatMap((head) => options.map((o) => (head ? `${head} ${o}` : o))),
    ['']
  );
}

const THANKS = expand(['thank', 'thanks', 'thank you', 'thanks you'], ['', 'so much']).map((p) =>
  p.trim()
);
const GOOD_TIME = expand(
  ['have a'],
  ['good', 'great', 'nice'],
  ['one', 'night', 'day', 'evening', 'weekend']
);
/** Words that may lead into a goodbye: "okay so, thanks, bye", "I said hang up". */
const LEADS = new Set([
  ...['ok', 'okay', 'alright', 'all right', 'well', 'so', 'anyway', 'yeah', 'yep', 'cool'],
  ...['great', 'perfect', 'right', 'just', 'please', 'hey', 'i said', 'go ahead and'],
  ...["i'll", 'ill', 'i will'],
  ...THANKS,
]);
/**
 * An ask to end the call: "hang up", "you need to end the call". Ends it
 * whatever Ferni answers. "you ..." only leads into these, never a goodbye:
 * "you gotta go" is not the caller leaving.
 */
const HANG_UPS = new Set(
  expand(['', 'you', 'you can', 'you need to', 'you have to'], ['hang up', 'end the call']).map(
    (p) => p.trim()
  )
);
/** A goodbye on its own. */
const CLOSERS = new Set([
  ...['bye', 'bye bye', 'byebye', 'goodbye', 'good night', 'goodnight', 'night night', 'later'],
  ...expand(['see'], ['ya', 'you'], ['', 'later', 'soon', 'tomorrow', 'around', 'next time']).map(
    (p) => p.trim()
  ),
  ...expand(['talk', 'talk to you'], ['later', 'soon', 'tomorrow']),
  ...['catch you later', 'take care', 'signing off', "i'm off", 'im off'],
  ...["i'll let you go", 'ill let you go'],
  ...GOOD_TIME,
  ...expand(
    ['i'],
    ['gotta', 'got to', 'have to', 'need to', 'should'],
    ['go', 'run', 'get going', 'head out', 'hop off']
  ),
  ...expand(['gotta', 'got to'], ['go', 'run', 'get going']),
  ...HANG_UPS,
]);
/** Words that may trail a goodbye: "bye now", "talk soon, ferni". */
const TAILS = new Set([
  'now',
  'then',
  'ferni',
  'friend',
  'buddy',
  'bro',
  'man',
  'for now',
  'right now',
  'please',
  'the phone',
  'bye',
  'bye bye',
  'byebye',
]);
/** A clause that may follow a goodbye without undoing it ("bye, thanks", "bye, love you"). */
const AFTERWORDS = new Set([
  ...THANKS,
  ...['ok', 'okay', 'alright', 'love you', 'you too', 'ferni', 'take care'],
  ...['bro', 'man', 'buddy', 'friend', 'dude'],
  ...GOOD_TIME,
]);
/** Longest phrase in any set, in words ("you need to end the call"). */
const MAX_PHRASE_WORDS = 6;

/** The longest phrase from `set` starting at word `at`, as a word count (0 if none). */
function phraseAt(words: readonly string[], at: number, set: ReadonlySet<string>): number {
  for (let len = Math.min(MAX_PHRASE_WORDS, words.length - at); len > 0; len--) {
    if (set.has(words.slice(at, at + len).join(' '))) return len;
  }
  return 0;
}

/** True when words[from..] is made only of phrases from `set`. */
function onlyPhrases(words: readonly string[], from: number, set: ReadonlySet<string>): boolean {
  for (let i = from; i < words.length;) {
    const len = phraseAt(words, i, set);
    if (len === 0) return false;
    i += len;
  }
  return true;
}

/** A clause that is a goodbye and nothing else: leads, one goodbye, tails. */
function closingClause(words: readonly string[], closers: ReadonlySet<string>): boolean {
  // The goodbye may start after any run of leads: "I'll let you go" is a goodbye that
  // starts with the lead "i'll", "okay, I'll talk to you later" one after it.
  for (let i = 0, lead = 0; i < words.length; i += lead) {
    // Try each goodbye length here: "bye bye now" is "bye bye" + "now" or "bye" + "bye now".
    for (let len = Math.min(MAX_PHRASE_WORDS, words.length - i); len > 0; len--) {
      if (closers.has(words.slice(i, i + len).join(' ')) && onlyPhrases(words, i + len, TAILS)) {
        return true;
      }
    }
    lead = phraseAt(words, i, LEADS);
    if (lead === 0) return false;
  }
  return false;
}

function clauseWords(text: string): string[][] {
  // Accents folded ("adiós" is "adios"); only warm symbols dropped ("bye 🙂", "bye :)").
  // Any other emoji stays a word no goodbye matches ("bye 😢"); letters of any script
  // stay, so a line in another script never matches a goodbye here.
  let t = stripWarmSymbols(text)
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[’]/g, "'");
  if (t.length > MAX_CALLER_CHARS) {
    // Keep the end, where a goodbye is, and drop the word the cut landed in.
    t = t.slice(-MAX_CALLER_CHARS);
    t = t.slice(t.search(/[\s.!?,;:]/) + 1);
  }
  return t
    .split(/[.!?,;:]/)
    .map((c) => c.split(/[\s-]/).filter(Boolean))
    .filter((words) => words.length > 0);
}

/** The last thing said (afterwords like "thanks" aside) is a clause from `closers` on its own. */
function endsWith(text: string, closers: ReadonlySet<string>): boolean {
  if (text.trim().endsWith('?')) return false; // "bye?" is a question, not a goodbye
  const parts = clauseWords(text);
  for (let i = parts.length - 1; i >= 0; i--) {
    const words = parts[i] ?? [];
    if (closingClause(words, closers)) return true;
    if (!onlyPhrases(words, 0, AFTERWORDS)) return false;
  }
  return false;
}

/** The caller is ending the call: their turn ends on a goodbye or a "hang up". */
export function callerSaysGoodbye(text: string): boolean {
  return endsWith(text, CLOSERS);
}

/** Pleasantries that fit a goodbye on their own: "thanks", "you too", "love you", "night". */
const SIGN_OFFS = new Set([
  ...AFTERWORDS,
  ...[
    'same to you',
    'you as well',
    'night',
    'all right',
    'yeah',
    'yep',
    'cool',
    'great',
    'perfect',
    // Goodnights, a day done, and Spanish ("adiós" is accent-folded, clauseWords)
    ...expand(['sleep'], ['well', 'tight']),
    'sweet dreams',
    ...expand(["i'm", 'im', 'i am'], ['done for'], ['today', 'tonight', 'the day', 'now']),
    ...['gracias', 'muchas gracias', 'adios', 'ciao', 'cheers'],
  ],
]);

/**
 * The caller is signing off: EVERY clause is a goodbye or a pleasantry that
 * fits one ("thanks", "thank you", "you too", "love you", "same to you",
 * "night"), and nothing in the line carries risk (farewell-risk.ts). "I won't
 * be here tomorrow. Bye." ends on a goodbye, but it is not a sign-off. After
 * `conversation_end` only a sign-off leaves the call ending (wrap-up-window.ts).
 */
export function callerSignsOff(text: string): boolean {
  if (text.length > MAX_CALLER_CHARS || text.trim().endsWith('?')) return false;
  const parts = clauseWords(text);
  return (
    parts.length > 0 &&
    parts.every((words) => closingClause(words, CLOSERS) || onlyPhrases(words, 0, SIGN_OFFS)) &&
    !farewellRisk(text)
  );
}

/** The caller asks Ferni to end the call: "hang up now", "you can end the call". */
export function callerAsksToHangUp(text: string): boolean {
  return endsWith(text, HANG_UPS);
}

/**
 * Leaving, which the goodbye words miss: "I should probably head out". Only at
 * the end of a clause or before "now"/"soon": "I need to go back to the
 * hospital after work tonight" and "I have to run errands all weekend" are
 * plans mid-story, not a goodbye (first calls, dev 2026-10-18).
 */
export const LEAVING =
  /\bi (?:should|need to|have to|gotta|better) (?:probably |really |just )?(?:go|get going|head (?:out|off)|let you go|get back|run|hop off)(?=\s*(?:$|[.,!?;:]|(?:now|soon|right now|for now|in a (?:bit|minute|sec|second|few))\b))/i;

/** They are ending the call: a goodbye on its own (callerSaysGoodbye), or leaving. */
export function leavingNow(said: string): boolean {
  return callerSaysGoodbye(said) || LEAVING.test(said);
}

const FERNI_GOODBYE =
  /\b(?:bye|goodbye|good ?night|take care|talk (?:to you )?(?:soon|later|tomorrow)|see you (?:soon|later|tomorrow|next time|then|around)|catch you later|have (?:a|an) (?:good|great|nice|lovely|wonderful|fun) (?:one|night|day|evening|weekend|time|dinner|trip)|go (?:enjoy|have fun))\b/i;

/** Ferni's reply says goodbye and doesn't end on a question. */
export function ferniSaysGoodbye(text: string): boolean {
  const t = text.trim();
  return !t.endsWith('?') && FERNI_GOODBYE.test(t.slice(-MAX_FERNI_CHARS));
}
