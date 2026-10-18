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
 * - a sign-off or pleasantry, every part of it ("catch you later", "talk soon,
 *   bye", "take care");
 * - without an action verb ("be fine", "dinner") or a verb that is only a
 *   stance ("think about it");
 * - an action on a bare pronoun and nothing else ("call her tomorrow", "do
 *   it"). Given the person it is about (resolved by the writer, never guessed
 *   from a transcript), her/him/them becomes the name: "call Mindy tomorrow".
 *
 * Whole words only ("bye" is not "bypass", "see you" is not "see your doctor").
 * Writers check before they store; readers (commitment-follow-up.ts
 * toOpenCommitment) check again, so what was stored before this is not shown.
 *
 * @module utils/commitment-quality
 */

import nlp from 'compromise';

/** "I'll", "I'm going to", "I need to": the part that says they mean it. */
const LEAD_IN =
  /\b(?:i'll|i will|i shall|i'm (?:going|gonna|planning|about) to|i am (?:going|planning|about) to|i'm gonna|gonna|i plan to|i promise(?: to)?|i swear(?: to)?|i commit to|i've decided to|i have decided to|i need to|i have to|i want to|i'd like to|let me)\s+/;
const FILLER_LEAD =
  /^(?:(?:probably|definitely|just|actually|really|totally|also|finally|maybe|then|try to|try and|be sure to|make sure to|go ahead and|have to|need to|want to)\s+)+/;

const INTERJECTION = /^(?:ok(?:ay)?|alright|well|so|yeah)$/;
const SIGN_OFF =
  /^(?:(?:ok(?:ay)?|alright|well|so|yeah)\s+)*(?:catch (?:you|ya|u)|talk(?: to (?:you|ya|u))?|speak(?: to (?:you|ya|u))?|chat|see (?:you|ya|u)|cya|bye(?: bye)?|goodbye|good ?night|night|later|laters|ttyl|peace(?: out)?|take care(?: of yourself)?|let (?:you|ya) go|head out|hop off|get going|get off|go|run|be right back|brb|bbl)(?:\s+(?:later|soon|tomorrow|then|around|again|next time|guys|all|everyone|man|buddy|friend|ferni|bye|now|tonight|in a bit|in a while))*$/;

/** Verbs that say how they feel or think, not what they'll do. */
const NOT_ACTION = new Set(
  'will would shall can could should may might must be no seem feel guess think hope wish bet know mean suppose reckon'.split(
    ' '
  )
);
/** Verbs that mean nothing without an object ("I'll try", "I'll see"). */
const NOT_ALONE = new Set(['try', 'see', 'do', 'go', 'run', 'manage', 'figure', 'survive']);
/** Verbs the parser reads as nouns. */
const ALSO_VERBS = new Set([
  'call',
  'text',
  'email',
  'message',
  'ping',
  'phone',
  'journal',
  'water',
]);

const PERSON_PRONOUNS = new Set(['her', 'him', 'them', 'em']);
const PRONOUNS = new Set([
  ...PERSON_PRONOUNS,
  ...'it that this those these you ya u he she they'.split(' '),
]);
/** Words that carry no object: particles, time words, articles, possessives. */
const FILLER = new Set(
  'back up out over off down around again later soon now today tonight tomorrow too also first thing right away asap eod maybe probably sometime quick quickly real next last week weekend morning afternoon evening night day month year the a an to with for about by at on in of and or i me my your his their our its'.split(
    ' '
  )
);
const FAMILY = new Set(['mom', 'dad', 'mum', 'mama', 'papa', 'grandma', 'grandpa', 'nana']);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[.!?"]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** What they say they'll do, with the lead-in and fillers taken off. */
function action(text: string): string {
  const lead = LEAD_IN.exec(text);
  const rest = lead ? text.slice(lead.index + lead[0].length) : text;
  return rest.replace(FILLER_LEAD, '').trim();
}

function isSignOff(rest: string): boolean {
  const parts = rest
    .split(/\s*(?:,|;|\band\b)\s*/)
    .filter((p) => p !== '' && !INTERJECTION.test(p));
  return parts.length > 0 && parts.every((p) => SIGN_OFF.test(p));
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

function shape(rest: string, motion: boolean): Shape {
  const doc = parse(`i will ${rest}`);
  if (!hasAction(doc, rest, motion)) return 'no_action';
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

function personLabel(person: string): string {
  const p = person.trim();
  if (/^[A-Z]/.test(p) || /^(?:my|our|the)\s/i.test(p) || FAMILY.has(p.toLowerCase())) return p;
  return `my ${p}`;
}

export interface CommitmentContext {
  /** Who it is about, resolved by the writer (a tool argument the model filled in). */
  person?: string;
}

export type NotActionable = 'sign_off' | 'no_action' | 'bare_pronoun';
export type CommitmentVerdict =
  { ok: true; statement: string } | { ok: false; reason: NotActionable };

/**
 * The statement to keep, with a bare her/him/them replaced by the person when
 * one is given, or why it is not a commitment anyone can act on.
 */
export function judgeCommitment(
  statement: string,
  context: CommitmentContext = {}
): CommitmentVerdict {
  const text = normalize(statement);
  const rest = action(text);
  if (!rest) return { ok: false, reason: 'no_action' };
  if (isSignOff(rest) || isSignOff(text)) return { ok: false, reason: 'sign_off' };
  const motion = /\b(?:off|heading|headed|going) to\b/.test(text);
  const kind = shape(rest, motion);
  if (kind === 'ok') return { ok: true, statement: statement.trim() };
  if (kind === 'no_action') return { ok: false, reason: 'no_action' };
  const person = context.person?.trim();
  if (kind !== 'bare_person' || !person || PRONOUNS.has(person.toLowerCase())) {
    return { ok: false, reason: 'bare_pronoun' };
  }
  const named = statement.trim().replace(/\b(?:her|him|them|'em)\b/i, personLabel(person));
  return { ok: true, statement: named };
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
