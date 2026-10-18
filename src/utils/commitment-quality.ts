/**
 * Whether a commitment is one Ferni can act on: ask how it went, put it in the
 * morning brief, push a follow-up.
 *
 * Prod 2026-10-18: the owner's open commitments in the morning brief were "call
 * her tomorrow" (who is her?) and "catch you later" (a goodbye). The turn-path
 * capture takes any "I'll ..." (commitment-keeper.ts, commitment-tracking.ts),
 * and an after-call quote can be just as bare, so the store holds lines that
 * reach the caller as nonsense on every path that reads it back.
 *
 * What is left once the "I'll" / "I need to" lead-in is taken off is rejected
 * when it is:
 * - a sign-off or pleasantry, every part of it ("catch you later", "love you,
 *   bye", "sounds good");
 * - without an action verb ("dinner"), a stance ("be fine", "think it over"),
 *   or a verb that means nothing alone ("try"). "Be" with somewhere, some time
 *   or a change is a plan ("be at the dentist at 2", "be nicer to my brother");
 *   "think about" with something to think about is one too;
 * - an action on a bare pronoun and nothing else ("call her tomorrow", "do
 *   it"). Given the person (resolved by the writer, never guessed from a
 *   transcript), her/him/them as the object becomes the name, whatever else
 *   the line holds: "text Mindy back after lunch".
 *
 * Whole words only ("bye" is not "bypass"). Caller text is cut to MAX_CHARS and
 * no pattern nests or overlaps quantifiers (stripping is done in loops). Writers
 * check before they store; readers (toOpenCommitment) check again.
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

const INTERJECTION = new Set(['ok', 'okay', 'alright', 'well', 'so', 'yeah', 'oh', 'hey']);
/** Said around a goodbye without changing it ("see you later guys"). */
const SIGN_OFF_TAIL = wordSet(
  'later soon tomorrow then around again next time guys all everyone man buddy friend ferni bye now tonight in a bit while'
);
const SIGN_OFF =
  /^(?:catch (?:you|ya|u)|talk(?: to (?:you|ya|u))?|speak(?: to (?:you|ya|u))?|chat|see (?:you|ya|u)|cya|bye(?: bye)?|goodbye|good ?night|night|later|laters|ttyl|peace(?: out)?|take care(?: of yourself)?|let (?:you|ya) go|head out|hop off|get going|get off|go|run|be right back|brb|bbl|love (?:you|ya|u)|sounds (?:good|great|fine|like a plan)|thanks(?: so much| a lot)?|thank you(?: so much)?|sure|will do|got it|perfect|cool|great|no worries)$/;

/** Verbs that say how they feel or think, not what they'll do. */
const NOT_ACTION = wordSet(
  'will would shall can could should may might must be no seem feel guess think hope wish bet know mean suppose reckon'
);
/** Verbs that mean nothing without an object ("I'll try", "I'll see"). */
const NOT_ALONE = new Set(['try', 'see', 'do', 'go', 'run', 'manage', 'figure', 'survive']);
/** Verbs the parser reads as nouns. */
const ALSO_VERBS = wordSet('call text email message ping phone journal water');
/** "Be" that is a state, not a plan: "be fine", "be right back", "be there" with nothing more. */
const BE_STATE =
  /^be (?:fine|ok|okay|good|alright|all right|right back|cool|great|safe|there|here|around|ok with (?:it|that)|fine with (?:it|that))$/;
const THINK_ABOUT = /^(?:think|thinking) (?:about|through|on) /;

const PERSON_PRONOUNS = new Set(['her', 'him', 'them', 'em']);
const PRONOUNS = wordSet('her him them em it that this those these you ya u he she they');
/** Words that carry no object: particles, time words, articles, possessives. */
const FILLER = wordSet(
  'back up out over off down around again later soon now today tonight tomorrow too also first thing right away asap eod maybe probably sometime quick quickly real next last week weekend morning afternoon evening night day month year the a an to with for about by at on in of and or i me my your his their our its'
);
/** After her/him/them, these say it was the object ("text her back"), not a possessive ("her mom"). */
const AFTER_OBJECT = new Set([
  ...FILLER,
  ...wordSet(
    "after before when once until while if so because how what that know i'm im monday tuesday wednesday thursday friday saturday sunday"
  ),
]);
const OBJECT_PRONOUN = /(?<![\w'])(?:her|him|them|'em)(?![\w'])/gi;

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

/** What they say they'll do, with the lead-in and fillers taken off. */
function action(text: string): string {
  const lead = LEAD_IN.exec(text);
  const rest = lead ? text.slice(lead.index + lead[0].length) : text;
  return stripAll(rest, FILLER_LEAD).trim();
}

function isSignOffPart(part: string): boolean {
  const words = part.split(' ').filter((w) => w !== '');
  while (words.length > 0 && INTERJECTION.has(words[0])) words.shift();
  while (words.length > 1 && SIGN_OFF_TAIL.has(words[words.length - 1])) words.pop();
  return words.length > 0 && SIGN_OFF.test(words.join(' '));
}

function isSignOff(rest: string): boolean {
  const parts = rest
    .split(/[,;]|\band\b/)
    .map((p) => p.trim())
    .filter((p) => p !== '' && !INTERJECTION.has(p));
  return parts.length > 0 && parts.every(isSignOffPart);
}

type Shape = 'ok' | 'no_action' | 'bare_person' | 'bare_thing';

/** The slice of the compromise parser used here (its own typings are not resolved). */
interface Term {
  normal: string;
  tags: string[];
}
interface Parsed {
  verbs: () => { json: () => Array<{ verb?: { infinitive?: string }; text: string }> };
  terms: () => { json: () => Array<{ terms: Term[] }> };
}
const parse = nlp as unknown as (text: string) => Parsed;

function hasAction(doc: Parsed, rest: string, motion: boolean): boolean {
  const verbs = doc
    .verbs()
    .json()
    .map((v) => v.verb?.infinitive ?? v.text)
    .filter((v) => !NOT_ACTION.has(v.split(' ')[0]));
  if (verbs.length === 0 && !ALSO_VERBS.has(rest.split(' ')[0]) && !motion) return false;
  const words = rest.split(/[\s,;]+/).map((w) => w.replace(/^'|'$/g, ''));
  return !(words.length === 1 && NOT_ALONE.has(words[0]));
}

/** Words that name something: not a pronoun, particle, article or time word. */
function contentWords(text: string): number {
  return text.split(/[\s,;]+/).filter((w) => w !== '' && !PRONOUNS.has(w) && !FILLER.has(w)).length;
}

/** "Be" and "think about" are judged on their words, not on how the parser reads them. */
function byWords(rest: string): Shape | undefined {
  if (/^be\b/.test(rest)) return BE_STATE.test(rest) ? 'no_action' : 'ok';
  if (!THINK_ABOUT.test(rest)) return undefined;
  return contentWords(rest.replace(THINK_ABOUT, '')) > 0 ? 'ok' : 'no_action';
}

function shape(rest: string, motion: boolean): Shape {
  const fixed = byWords(rest);
  if (fixed) return fixed;
  const head = rest.split(' ').slice(0, PARSE_WORDS).join(' ');
  const doc = parse(`i will ${head}`);
  if (!hasAction(doc, head, motion)) return 'no_action';
  // The terms after "i will": what the action is done to.
  const terms = doc
    .terms()
    .json()
    .slice(2)
    .map((t) => t.terms[0]);
  let pronoun: string | undefined;
  let content = 0;
  for (const t of terms) {
    const w = t.normal.replace(/^'|'$/g, '');
    if (PRONOUNS.has(w)) pronoun ??= w;
    else if (t.tags.includes('Verb') || ALSO_VERBS.has(w) || FILLER.has(w)) continue;
    else if (!['Date', 'Time', 'Duration'].some((tag) => t.tags.includes(tag))) content++;
  }
  if (content > 0 || pronoun === undefined) return 'ok';
  return PERSON_PRONOUNS.has(pronoun) ? 'bare_person' : 'bare_thing';
}

/** The first her/him/them that is the object ("text her back"), replaced by the person. */
function namePerson(statement: string, person: string): string {
  for (const m of statement.matchAll(OBJECT_PRONOUN)) {
    const next = /^\s*([\w'’]+)/.exec(statement.slice(m.index + m[0].length))?.[1];
    if (next === undefined || AFTER_OBJECT.has(next.toLowerCase())) {
      return statement.slice(0, m.index) + person + statement.slice(m.index + m[0].length);
    }
  }
  return statement;
}

export interface CommitmentContext {
  /** Who it is about, resolved by the writer (a tool argument the model filled in). */
  person?: string;
}

export type NotActionable = 'sign_off' | 'no_action' | 'bare_pronoun';
export type CommitmentVerdict =
  { ok: true; statement: string } | { ok: false; reason: NotActionable };

/**
 * The statement to keep, with her/him/them as the object replaced by the
 * person when one is given, or why it is not a commitment anyone can act on.
 */
export function judgeCommitment(
  statement: string,
  context: CommitmentContext = {}
): CommitmentVerdict {
  const said = cap(statement).trim();
  const text = normalize(said);
  const rest = action(text);
  if (!rest) return { ok: false, reason: 'no_action' };
  if (isSignOff(rest) || isSignOff(text)) return { ok: false, reason: 'sign_off' };
  const motion = /\b(?:off|heading|headed|going) to\b/.test(text);
  const kind = shape(rest, motion);
  if (kind === 'no_action') return { ok: false, reason: 'no_action' };
  const person = cap(context.person ?? '').trim();
  const named = person && !PRONOUNS.has(person.toLowerCase()) ? namePerson(said, person) : said;
  if (kind === 'ok' || (kind === 'bare_person' && named !== said)) {
    return { ok: true, statement: named };
  }
  return { ok: false, reason: 'bare_pronoun' };
}

/** The statement to keep (see judgeCommitment), or null. */
export function actionableCommitment(
  statement: string,
  context?: CommitmentContext
): string | null {
  const verdict = judgeCommitment(statement, context);
  return verdict.ok ? verdict.statement : null;
}

export function isActionableCommitment(statement: string, context?: CommitmentContext): boolean {
  return judgeCommitment(statement, context).ok;
}

const LEAD_IN_ANY_CASE = new RegExp(LEAD_IN.source, 'i');

/**
 * What they said they'd do, in their words without the "I'll" / "I'm going
 * to" in front or the "lol" and punctuation behind, for every reader to show:
 * "Okay, I'm going to call my sister Sunday!" is "call my sister Sunday", and
 * "I'm going to the gym" is "go to the gym". Null when judgeCommitment
 * rejects it.
 */
export function commitmentAction(statement: string): string | null {
  if (!judgeCommitment(statement).ok) return null;
  const text = cap(statement).replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
  const lead = LEAD_IN_ANY_CASE.exec(text);
  const after = lead ? text.slice(lead.index + lead[0].length) : stripAll(text, OPENER).trim();
  let rest = trimTrailer(stripAll(after, FILLER_LEAD).trim());
  const lower = rest.toLowerCase().split(' ').slice(0, PARSE_WORDS).join(' ');
  if (lead && /(?:going|heading|headed) to\s$/i.test(lead[0])) {
    if (!/^be\b/.test(lower) && !hasAction(parse(`i will ${lower}`), lower, false)) {
      rest = `go to ${rest}`;
    }
  }
  return rest === '' ? trimTrailer(text) : rest;
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

/** commitmentAction's words as said back to them: "call my sister" is "call your sister". */
export function toSecondPerson(action: string): string {
  return cap(action).replace(
    /\b(?:i'm|i'll|i've|i|me|my|mine|myself)\b/gi,
    (w) => TO_YOU[w.toLowerCase()] ?? w
  );
}
