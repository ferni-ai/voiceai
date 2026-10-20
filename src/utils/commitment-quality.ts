/**
 * Which "commitments" are confidently not one, and how to show the rest.
 *
 * Prod 2026-10-18: the owner's morning brief showed "call her tomorrow" and
 * "catch you later". The turn-path capture takes any "I'll ...", so the store
 * holds goodbyes and pleasantries next to real plans.
 *
 * The gate's only error is letting junk through, never dropping a plan: it
 * rejects a line only when, after the "I'll" / "I need to" lead-in, every part
 * is a goodbye or pleasantry, or it has no verb. A pronoun never drops one
 * ("I owe Tom fifty bucks, I'll pay him back Friday" is kept, and shown whole).
 * Given the person, her/him/them as the object becomes the name. Readers that
 * show a line on its own skip one that needs context ("call her tomorrow");
 * the call check-in, where the model has the conversation, gets it as is.
 *
 * Whole words only. Caller text is cut to MAX_CHARS, and no pattern nests or
 * overlaps quantifiers (stripping is done in loops).
 *
 * @module utils/commitment-quality
 */

import nlp from 'compromise';

/** Longer than any spoken commitment; caps the work every pattern can do. */
export const MAX_CHARS = 300;
/** The parser reads only this many words: the verb and its object come first. */
const PARSE_WORDS = 24;

function wordSet(list: string): Set<string> {
  return new Set(list.split(' '));
}

/** "I'll", "I'm going to", "I need to": the part that says they mean it. */
const LEAD_IN =
  /\b(?:i'll|i will|i shall|we'll|we will|i'm (?:going|gonna|planning|about) to|i am (?:going|planning|about) to|i'm gonna|gonna|i gotta|gotta|i've got to|i got to|got to|i plan to|i promise(?: to)?|i swear(?: to)?|i commit to|i've decided to|i have decided to|i need to|i have to|i want to|i'd like to|let me)\s/i;
/** One filler word or phrase at the start, stripped one at a time. */
const FILLER_LEAD =
  /^(?:probably|definitely|just|actually|really|totally|also|finally|maybe|then|try to|try and|be sure to|make sure to|go ahead and|have to|need to|want to)\s/i;
const OPENER = /^(?:ok|okay|alright|well|so|yeah|and|but|honestly)\b[,\s]/i;
const TRAILING_FILLER = /(?:^|[,\s])(?:lol|haha|i guess|i think|or something|or whatever|anyway)$/i;
const TRAILING_PUNCT = new Set([...' \t\n,;:.!?"']);

const INTERJECTION = wordSet('ok okay alright well so yeah oh hey lol haha');
/** Said around a goodbye without changing it ("see you later guys", "I'm fine thanks"). */
const SIGN_OFF_TAIL = wordSet(
  'later soon tomorrow then around again next time guys all everyone man buddy friend ferni bye now tonight in a bit while thanks'
);
/** Whole goodbyes and pleasantries: a part of a line that is only one of these says nothing. */
const SIGN_OFF =
  /^(?:catch (?:you|ya|u)|talk(?: to (?:you|ya|u))?|speak(?: to (?:you|ya|u))?|chat|see (?:you|ya|u)|see|cya|bye(?: bye)?|goodbye|good ?night|night|later|laters|ttyl|peace(?: out)?|take care(?: of yourself)?|let (?:you|ya) go|head out|hop off|get going|get off|go|run|be right back|brb|bbl|call it a (?:night|day)|love (?:you|ya|u)|sounds (?:good|great|fine|like a plan)(?: to me)?|thanks(?: so much| a lot)?|thank you(?: so much)?|no thanks|sure|for sure|will do|got it|gotcha|perfect|cool(?: cool)?|great|nice(?: nice)?|right on|all good|no worries|have a good (?:one|day|night|weekend)|(?:i )?appreciate (?:it|that|you)|keep (?:that|it|this) in mind|think about it|try|survive|manage|i (?:think|hope|guess|suppose) so|i guess|i suppose|i know|be (?:fine|ok|okay|good|alright|all right|cool|great|safe|there|here|around)|i'm (?:so |really |pretty )?(?:good|fine|ok|okay|alright|great|tired|exhausted)|i'm doing (?:good|ok|okay|well|fine|alright|great))$/;

/** Modals: "I will" alone has no verb. */
const MODALS = wordSet('will would shall can could should may might must');
/** Verbs the parser reads as nouns. */
const ALSO_VERBS = wordSet('call text email message ping phone journal water');
const PRONOUNS = wordSet('her him them em it that this those these you ya u he she they');
/** Words that carry no object: particles, time words, articles, possessives. */
const FILLER = wordSet(
  'back up out over off down around again later soon now today tonight tomorrow too also first thing right away asap eod maybe probably sometime quick quickly real next last week weekend morning afternoon evening night day month year the a an to with for about by at on in of and or i me my your his their our its'
);
/** After a pronoun, these say it was the object ("text her back"), not a possessive ("her mom"). */
const AFTER_OBJECT = new Set([
  ...FILLER,
  ...wordSet(
    "after before when once until while if so because how what that know then i'm im monday tuesday wednesday thursday friday saturday sunday"
  ),
]);
/** After "it" / "that", only these say it was the object ("pay it Thursday", not "that the door"). */
const AFTER_THING = wordSet(
  'back up out over off down around again later soon now today tonight tomorrow first thing right away asap eod sometime next this after before in on by at then monday tuesday wednesday thursday friday saturday sunday'
);
const PERSON_PRONOUN = /(?<![\w'])(?:her|him|them|'em)(?![\w'])/gi;
const ANY_OBJECT_PRONOUN = /(?<![\w'])(?:her|him|them|'em|it|that)(?![\w'])/gi;

function cap(text: string): string {
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
}

function normalize(text: string): string {
  return cap(text)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[.!?"]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripAll(text: string, pattern: RegExp): string {
  let out = text;
  for (let m = pattern.exec(out); m; m = pattern.exec(out))
    out = out.slice(m[0].length).trimStart();
  return out;
}

/** Trailing punctuation and filler ("..., lol!"), one piece at a time. */
function trimTrailer(text: string): string {
  let out = text;
  for (;;) {
    let end = out.length;
    while (end > 0 && TRAILING_PUNCT.has(out[end - 1])) end--;
    const m = TRAILING_FILLER.exec(out.slice(0, end));
    const next = m ? out.slice(0, m.index) : out.slice(0, end);
    if (next === out) return out;
    out = next;
  }
}

function headWords(text: string): string {
  return text.split(' ').slice(0, PARSE_WORDS).join(' ');
}

/** The words before the lead-in and what they say they'll do after it. */
function split(text: string): { before: string; rest: string } {
  const lead = LEAD_IN.exec(text);
  if (!lead) return { before: '', rest: stripAll(text, FILLER_LEAD).trim() };
  const rest = stripAll(text.slice(lead.index + lead[0].length), FILLER_LEAD).trim();
  return { before: text.slice(0, lead.index).trim(), rest };
}

function isSignOffPart(part: string): boolean {
  const words = part.split(' ').filter((w) => w !== '');
  while (words.length > 0 && INTERJECTION.has(words[0])) words.shift();
  for (;;) {
    if (words.length === 0 || SIGN_OFF.test(words.join(' '))) return true;
    if (words.length === 1 || !SIGN_OFF_TAIL.has(words[words.length - 1])) return false;
    words.pop();
  }
}

/** Every comma-, semicolon- or "and"-separated part is a goodbye, pleasantry or interjection. */
function isSignOff(text: string): boolean {
  const parts = text
    .split(/[,;]|\band\b/)
    .map((p) => p.trim())
    .filter((p) => p !== '');
  return parts.length > 0 && parts.every(isSignOffPart);
}

/** The slice of the compromise parser used here (its own typings are not resolved). */
interface Parsed {
  verbs: () => { json: () => Array<{ verb?: { infinitive?: string }; text: string }> };
  nouns: () => { json: () => Array<{ text: string }> };
}
const parse = nlp as unknown as (text: string) => Parsed;

function hasVerb(rest: string): boolean {
  const head = headWords(rest);
  if (ALSO_VERBS.has(head.split(' ')[0]) || /^be\b/.test(head)) return true;
  return parse(`i will ${head}`)
    .verbs()
    .json()
    .some((v) => !MODALS.has((v.verb?.infinitive ?? v.text).split(' ')[0]));
}

/** A noun that is not a pronoun ("Tom", "the rent"), skipping the words in `skip`. */
function namesSomething(text: string, skip: ReadonlySet<string> = new Set()): boolean {
  return parse(headWords(text))
    .nouns()
    .json()
    .some((n) =>
      n.text
        .toLowerCase()
        .split(/\s+/)
        .some((w) => !PRONOUNS.has(w) && !FILLER.has(w) && !skip.has(w))
    );
}

/** The words before the lead-in name something ("I owe Tom fifty bucks, I'll ..."). */
function hasContext(before: string): boolean {
  return before !== '' && !isSignOff(before) && namesSomething(before);
}

/** The first pronoun matched by `pattern` that is the object ("text her back"), or null. */
function objectPronounAt(line: string, pattern: RegExp): { index: number; length: number } | null {
  for (const m of line.matchAll(pattern)) {
    const next = /^\s*([\w'’]+)/.exec(line.slice(m.index + m[0].length))?.[1]?.toLowerCase();
    const thing = /^(?:it|that)$/i.test(m[0]);
    if (next === undefined || (thing ? AFTER_THING : AFTER_OBJECT).has(next)) {
      return { index: m.index, length: m[0].length };
    }
  }
  return null;
}

function namePerson(statement: string, person: string): string {
  const at = objectPronounAt(statement, PERSON_PRONOUN);
  if (!at) return statement;
  return statement.slice(0, at.index) + person + statement.slice(at.index + at.length);
}

export interface CommitmentContext {
  /** Who it is about, resolved by the writer (a tool argument the model filled in). */
  person?: string;
}

export type NotActionable = 'sign_off' | 'no_action';
export type CommitmentVerdict =
  { ok: true; statement: string } | { ok: false; reason: NotActionable };

/**
 * The statement to store (their whole line, with her/him/them as the object
 * replaced by the person when one is given), or why it is confidently not a
 * commitment.
 */
export function judgeCommitment(
  statement: string,
  context: CommitmentContext = {}
): CommitmentVerdict {
  const said = cap(statement).trim();
  const text = normalize(said);
  const { before, rest } = split(text);
  if (!hasContext(before)) {
    if (rest === '' || isSignOff(rest) || isSignOff(text)) return { ok: false, reason: 'sign_off' };
    const motion = /\b(?:off|heading|headed|going) to\b/.test(text);
    if (!motion && !hasVerb(rest)) return { ok: false, reason: 'no_action' };
  }
  const person = cap(context.person ?? '').trim();
  const named = person && !PRONOUNS.has(person.toLowerCase()) ? namePerson(said, person) : said;
  return { ok: true, statement: named };
}

export function isActionableCommitment(statement: string, context?: CommitmentContext): boolean {
  return judgeCommitment(statement, context).ok;
}

/** The line, in their words: the whole of it when the words before the lead-in name something. */
export interface CommitmentLine {
  text: string;
  /** True when `text` is their whole line ("I owe Tom ..., I'll pay him back Friday"). */
  whole: boolean;
}

/**
 * What they said they'd do, for a reader to show. Without context before the
 * lead-in, the "I'll" / "I'm going to" and the "lol" and punctuation come off:
 * "Okay, I'm going to call my sister Sunday!" is "call my sister Sunday", and
 * "I'm going to the gym" is "go to the gym". Null when judgeCommitment rejects it.
 */
export function commitmentLine(statement: string): CommitmentLine | null {
  if (!judgeCommitment(statement).ok) return null;
  const text = cap(statement).replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
  const lead = LEAD_IN.exec(text);
  if (lead && hasContext(normalize(text.slice(0, lead.index)))) {
    return { text: trimTrailer(text), whole: true };
  }
  const after = lead ? text.slice(lead.index + lead[0].length) : stripAll(text, OPENER).trim();
  let rest = trimTrailer(stripAll(after, FILLER_LEAD).trim());
  const lower = headWords(rest.toLowerCase());
  if (lead && /(?:going|heading|headed) to\s$/i.test(lead[0]) && !hasVerb(lower)) {
    rest = `go to ${rest}`;
  }
  return { text: rest === '' ? trimTrailer(text) : rest, whole: false };
}

/**
 * True when a line shown on its own would leave the listener asking "who?" or
 * "what?": its object is a bare her/him/them/it/that ("call her tomorrow",
 * "pay it Thursday") and nothing before it says who or what.
 */
export function needsContext(line: CommitmentLine): boolean {
  if (line.whole) return false;
  const text = cap(line.text);
  const at = objectPronounAt(text, ANY_OBJECT_PRONOUN);
  if (!at) return false;
  // "call my mom and tell her I'm sorry": something before it says who.
  const before = text.slice(0, at.index).toLowerCase().trim();
  return !namesSomething(before, new Set([before.split(' ')[0]]));
}

const TO_YOU: Record<string, string> = {
  i: 'you',
  "i'm": "you're",
  "i'll": "you'll",
  "i've": "you've",
  me: 'you',
  my: 'your',
  mine: 'yours',
  myself: 'yourself',
};

/** A line's words as said back to them: "call my sister" is "call your sister". */
export function toSecondPerson(action: string): string {
  return cap(action).replace(
    /\b(?:i'm|i'll|i've|i|me|my|mine|myself)\b/gi,
    (w) => TO_YOU[w.toLowerCase()] ?? w
  );
}
