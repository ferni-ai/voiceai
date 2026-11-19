/**
 * SCREEN_SPELLED_PII (#3346): the match-only fold the caller-text screen also reads, so a number,
 * link, credential word or code spelled to slip past it reads as written. Nothing here is ever
 * shown or quoted.
 *
 * @module services/outreach/caller-text-fold
 */

/** Verbs that ask for a code to be passed on ("send", "read me", "tell"). "Said" is left out: it
 * mostly reports ("he said the code compiles") rather than asks. */
const RELAY_VERBS =
  'send|sends|sent|sending|give|gives|gave|giving|read|reads|reading|tell|tells|told|telling|forward|forwards|forwarded|forwarding|text|texts|texted|texting|share|shares|shared|sharing|say|says|saying|repeat|repeats|repeated|repeating';

/**
 * A request to pass on a code ("send me the code she gets"), one sentence and 30 characters
 * at most apart. A dress, zip, area or promo code is not one, nor a code of conduct, a code
 * review, a code word or code sent to production, unless the code is one someone received
 * (`receivedCodeAsk`).
 */
export const RELAYED_CODE = new RegExp(
  String.raw`\b(?:${RELAY_VERBS})\b[^.?!]{0,30}(?<!\b(?:dress|zip|postal|post|area|source|morse|colou?r|country|bar|promo|discount|coupon)\s)\bcodes?\b(?!\s+(?:of\s+(?:conduct|ethics|honou?r)|reviews?|words?|names?|base|to\s+prod(?:uction)?)\b)`,
  'i'
);

/** Any ask for a code, compounds included: a relay verb or "what's", then "code". */
const CODE_ASK = new RegExp(
  String.raw`\b(?:${RELAY_VERBS}|what(?:['’]s|s|\s+is|\s+was))\b[^.?!]{0,30}\bcodes?\b`,
  'gi'
);

/** A sign the code is one someone received: texted, on a phone, a one-time or verification code. */
const RECEIVED_CUE =
  /\b(?:texted|texts|(?:a|the|that|this|your|her|his|their|my)\s+text|got|gets|received|receives?|sent\s+(?:to\s+)?(?:you|me)|(?:on|to)\s+(?:your|her|his|their|my)\s+phone|verification|one-time|otp)\b/i;

/** How far either side of a code ask a received cue still counts, within its sentence. */
const CUE_REACH = 80;

/**
 * SCREEN_SPELLED_PII: an ask for a code with a received cue in the same sentence ("read me the
 * promo code they texted you", "what's the code word they sent to your phone"). The compound
 * exclusions in RELAYED_CODE don't apply then: a received code is the one a scam is after.
 */
export function receivedCodeAsk(text: string): boolean {
  for (const ask of text.matchAll(CODE_ASK)) {
    const from = ask.index;
    const to = from + ask[0].length;
    const before = text.slice(Math.max(0, from - CUE_REACH), from).replace(/^[^]*[.?!]/u, '');
    const after = text.slice(to, to + CUE_REACH).split(/[.?!]/u)[0];
    if (RECEIVED_CUE.test(before + ask[0] + after)) return true;
  }
  return false;
}

/**
 * SCREEN_SPELLED_PII: a copy of the text for matching only, never shown or quoted, so a number,
 * a link or a credential word spelled to slip past RISKY reads as written: Cyrillic or Greek
 * look-alikes in a Latin word ("pаssword"), a link said aloud ("example dot com slash help") and
 * spelled or disguised digit runs ("five five five, zero one four two", "555-O142").
 */
export function foldForScreen(text: string): string {
  const folded = text
    .replace(/[\p{L}\p{M}]+/gu, foldMixedScript)
    .replace(SPOKEN_LINK, '$1.$2')
    .replace(SPOKEN_SLASH, '/');
  return foldDigitRuns(folded);
}

/** Cyrillic and Greek letters that look like Latin ones, folded only inside a Latin word. */
const CONFUSABLE: Readonly<Record<string, string>> = Object.fromEntries(
  [
    ['аеорсухіјѕԁһӏ', 'aeopcyxijsdhl'],
    ['АВЕКМНОРСТХІЈЅ', 'ABEKMHOPCTXIJS'],
    ['αεικνορτυχ', 'aeikvoptux'],
    ['ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ', 'ABEZHIKMNOPTYX'],
  ].flatMap(([from, to]) => [...from].map((c, i): [string, string] => [c, to[i]]))
);

/** A word that mixes Latin with Cyrillic or Greek, its look-alikes folded; any other word as is. */
function foldMixedScript(word: string): string {
  if (!/\p{Script=Latin}/u.test(word) || !/[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(word)) {
    return word;
  }
  return [...word].map((c) => CONFUSABLE[c] ?? c).join('');
}

/** "example dot com": a word, "dot", a link ending. */
const SPOKEN_LINK =
  /(?<![\p{L}\p{N}])([\p{L}\p{N}-]{2,40})\s{1,3}dot\s{1,3}(com|net|org|io|edu|gov|info|biz|xyz|app|dev|shop|link|us|uk)(?![\p{L}\p{N}])/giu;
const SPOKEN_SLASH = /\s{0,3}\bslash\b\s{0,3}/giu;

/** A digit said as a word; "oh" and "o" read as zero only beside other digits. */
const DIGIT_WORDS: Readonly<Record<string, string>> = {
  zero: '0',
  oh: '0',
  o: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
};
/** Digits with O, o, I or l among them ("555O142", "0l42"): at least one real digit. */
const DISGUISED_DIGITS = /^[OoIl]*(?:\p{Nd}[OoIl]*)+$/u;
const RUN_JOINER = /^(?:dash|hyphen)$/i;

/** A word's digits, if it is a digit word or digits with look-alike letters. */
function wordDigits(word: string): { digits: string; spelled: boolean } | undefined {
  const spelled = DIGIT_WORDS[word.toLowerCase()];
  if (spelled !== undefined) return { digits: spelled, spelled: true };
  if (!DISGUISED_DIGITS.test(word)) return undefined;
  return { digits: word.replace(/[Oo]/g, '0').replace(/[Il]/g, '1'), spelled: false };
}

/** A number from 1 to `max`, written in one or two real digits. */
const upTo = (group: string, max: number): boolean =>
  /^[0-9]{1,2}$/.test(group) && Number(group) >= 1 && Number(group) <= max;

/**
 * A whole run written as a date, kept as written: real digits ("1l/19/2O26" is not), split only
 * by "/", a month 1-12, a day 1-31 and a year of 2 or 4 digits if any. `held` alternates words
 * and separators, so a run that goes on past the date ("11/19/2026 555 0142") is not one.
 */
function slashDate(held: readonly string[]): boolean {
  const groups = held.filter((_, i) => i % 2 === 0);
  const separators = held.filter((_, i) => i % 2 === 1);
  if (separators.length < 1 || separators.length > 2) return false;
  if (!separators.every((s) => s === '/')) return false;
  const [month, day, year] = groups;
  return (
    upTo(month, 12) && upTo(day, 31) && (year === undefined || /^(?:[0-9]{2}|[0-9]{4})$/.test(year))
  );
}

/** A digit run as read: its digits, its words and inner separators as written, and its tail. */
interface Run {
  digits: string[];
  held: string[];
  tail: string[];
  spelled: boolean;
}

/** Text between two runs that is only separators or "dash": the runs touch. */
const GAP = /^(?:[\s,().\-–—/]|dash|hyphen)*$/iu;

/**
 * Each run of digit words and digits, apart by at most three of space, comma, dot, bracket,
 * slash, hyphen or en/em dash (or the word "dash"), becomes its digits, so RISKY's seven-digit
 * rule decides. A lone spelled digit ("call me at five", "two kids") and a slashed date stay as
 * written, but a date that touches another run across only separators ("11/19/2026    555")
 * gives up its place: the touching runs' digits are counted together. Linear: one pass over the
 * words and one over the runs.
 */
function foldDigitRuns(text: string): string {
  const parts = text.split(/([\s,().\-–—/]+)/u);
  const pieces: Array<string | Run> = [];
  let run: Run | undefined;
  parts.forEach((part, i) => {
    const read = i % 2 === 0 ? wordDigits(part) : undefined;
    if (read) {
      run ??= { digits: [], held: [], tail: [], spelled: true };
      run.digits.push(read.digits);
      run.held.push(...run.tail, part);
      run.tail = [];
      run.spelled &&= read.spelled;
    } else if (run && (i % 2 === 1 ? part.length <= 3 : RUN_JOINER.test(part))) {
      run.tail.push(part);
    } else {
      if (run) pieces.push(run);
      run = undefined;
      pieces.push(part);
    }
  });
  if (run) pieces.push(run);
  return joinRuns(pieces);
}

/** The folded text: each cluster of touching runs that holds a date as one digit string. */
function joinRuns(pieces: ReadonlyArray<string | Run>): string {
  const out: string[] = [];
  for (let i = 0; i < pieces.length; i += 1) {
    const first = pieces[i];
    if (typeof first === 'string') {
      out.push(first);
      continue;
    }
    const cluster: Run[] = [first];
    let end = i;
    for (let j = i + 1; j < pieces.length; j += 1) {
      const next = pieces[j];
      if (typeof next !== 'string') {
        cluster.push(next);
        end = j;
      } else if (!GAP.test(next)) break;
    }
    const last = cluster[cluster.length - 1];
    if (cluster.length > 1 && cluster.some((r) => slashDate(r.held))) {
      out.push(cluster.flatMap((r) => r.digits).join(''), ...last.tail);
    } else {
      for (let k = i; k <= end; k += 1) out.push(shown(pieces[k]));
    }
    i = end;
  }
  return out.join('');
}

/** One run as RISKY reads it: its digits, or as written when it is a lone spelled digit or a date. */
function shown(piece: string | Run): string {
  if (typeof piece === 'string') return piece;
  const keep = (piece.spelled && piece.digits.length < 2) || slashDate(piece.held);
  return (keep ? piece.held.join('') : piece.digits.join('')) + piece.tail.join('');
}
