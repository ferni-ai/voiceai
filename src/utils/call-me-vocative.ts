/**
 * "Call me, Ferni" is a phone call, not a nickname (CALL_ME_VOCATIVE=on).
 *
 * Prod 2026-10-23, the owner's own sessions: STT wrote "Can you call me
 * Fern?" for "Can you call me, Ferni?", and Ferni said "Oh, you want me to
 * call you Fern? I can absolutely do that." Only "No, call me on the phone."
 * rang. Another time "Did you give me a call?" got "No, I didn't."
 *
 * A word list of STT spellings failed review (PR #2698 round 1): "Ferney"
 * still renamed the owner, and "Pete" or "Mya" were dropped as names for every
 * caller. So a word after "call me" is read by its likeness to a team name
 * (`personaLike`: same first letter and an edit distance of 1, or 2 with the
 * same consonants), and a likely misreading is never decided here:
 * - `ring`: a clear request to phone them ("ring me", "give me a call", "call
 *   me back", "call my phone", "Ferni, call me", "call me now, Fern") or "call
 *   me <the speaking persona's own name>".
 * - `ask`: "call me <a word like a team name>" with nothing else to go on
 *   ("Could you call me Ferney"): Ferni asks whether to ring or to use the name.
 * - `rename`: the same word after a rename cue ("just call me Pete", "my
 *   friends call me Mya", "call me Fern from now on"): a name to confirm.
 * - `did-you-call`: "did you call me?" / "did you give me a call?".
 * `spans` are the "call me <vocative>" stretches, so name capture skips only
 * them: "I'm Sam, not Seth. Call me, Ferni." still gives Sam. Nothing here
 * saves a name or places a call (tools/domains/conversation/name-confirm.ts asks first).
 *
 * @module utils/call-me-vocative
 */

import { flagOn, type Env } from '../config/env-flag.js';
import { FERNI_HEARD_AS, HEARD_AS, TEAM_FIRST_NAMES } from './teammate-talk.js';

export function callMeVocativeEnabled(env: Env = process.env): boolean {
  return flagOn('CALL_ME_VOCATIVE', env);
}

export function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

/** First letter, then the consonants (y as a vowel), doubles collapsed: "ferney" and "ferni" are "frn". */
const consonants = (w: string): string =>
  (w[0] + w.slice(1).replace(/[aeiouy]/g, '')).replace(/(.)\1+/g, '$1');

/** The team first name (lowercase) this word may be a hearing of, or null. Case and hyphens ignored. */
export function personaLike(word: string): string | null {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length < 3) return null;
  for (const name of TEAM_FIRST_NAMES) {
    if (w === name || HEARD_AS[w]?.split('-')[0] === name) return name;
    if (name === 'ferni' && (FERNI_HEARD_AS as readonly string[]).includes(w)) return name;
    if (w[0] !== name[0]) continue;
    const d = editDistance(w, name);
    if (d <= 1 || (d <= 2 && consonants(w) === consonants(name))) return name;
  }
  return null;
}

export interface CallMeReading {
  intent: 'ring' | 'ask' | 'did-you-call' | null;
  /** `ask`: the word heard after "call me". */
  name?: string;
  /** A team-like word after a rename cue: a name to confirm, not a call. */
  rename?: string;
  /** [start, end) of each "call me <vocative>" in the words. */
  spans: Array<[number, number]>;
}

const SEP = String.raw`[\s,.…-]*`;
const FILLER = String.raw`(?:right\s+now|right\s+away|real\s+quick|um+|uh+|erm?|please|up|now|asap|back|again|quick(?:ly)?|then|ok(?:ay)?)`;
const FILLER_AT = new RegExp(String.raw`^${SEP}${FILLER}(?![\p{L}'’])`, 'iu');
const LATER =
  /^[\s,]*(?:later|tomorrow|tonight|sometime|when|after|before|next|at\s+\d|in\s+(?:an?\s+hour|\d+|a\s+(?:few|couple|bit|while))|this\s+(?:morning|afternoon|evening|weekend)|on\s+\w+day)\b/i;
const NEGATED = /\b(?:don['’]?t|do\s+not|never|no\s+need\s+to|stop)\s+(?:\w+\s+)?$/i;
/** Asking them to do it: a clause start, "can you", "please", "I want you to", a name said to them. */
const IMPERATIVE =
  /(?:^|[.!?,;:]\s*|\b(?:you|ya|u)\s+(?:(?:can|could|should|to|gotta|must|need\s+to)\s+)?(?:please\s+|just\s+)?|\b(?:please|and|so|then|now|ok(?:ay)?|hey|go\s+ahead\s+and)\s+)$/i;
const RENAME_BEFORE =
  /(?:\b(?:just|everyone|everybody|people|they|friends|folks|family|instead|rather)|\bactually,?|\b(?:you|y['’]?all)\s+(?:can|could)|\b(?:don['’]?t|do\s+not|stop)\s+call(?:ing)?\s+me\s+[\p{L}-]+[,.;]?)\s+(?:just\s+)?$/iu;
const RENAME_AFTER =
  /^[\s,]*(?:from\s+now\s+on|instead|going\s+forward|from\s+here\s+on|for\s+short)\b/i;
const ASKER = /\b(?:can|could|would|will)\s+(?:you|ya|u)\s+(?:please\s+)?just\s+$/i;
const RING_PHRASES = [
  /\b(?:ring|phone|buzz)\s+me\b/gi,
  /\bgive\s+me\s+a\s+(?:call|ring|buzz|bell)\b/gi,
  /\bcall\s+(?:me\s+(?:on|at)\s+)?my\s+(?:phone|cell(?:\s*phone)?|mobile|number)\b/gi,
];
/** "did/have/were you (just) call me / give me a call": a question, never a request. */
const ASKS_IF_CALLED = String.raw`\b(?:did|have|has|were|was)\s+(?:you|ya)\s+(?:(?:just|already|ever|been|even)\s+){0,2}(?:g[ai]ve\s+me\s+a\s+(?:call|ring|buzz)|call(?:ed|ing)?\s+me|ring(?:ed|ing)?\s+me|phon(?:e|ed|ing)\s+me|tr(?:y|ied|ying)\s+(?:to\s+call|to\s+ring|calling|ringing)\s+me)`;
const WHEN = String.raw`(?:\s+(?:yet|today|earlier|before|already|back|yesterday|last night|this morning))?`;
const WORD_AT = /^[\s,.…-]*([\p{L}]+(?:-[\p{L}]+)?)/u;

/** The clause before `at`: from the last sentence stop. */
const clauseBefore = (words: string, at: number): string =>
  words
    .slice(0, at)
    .split(/[.!?;]\s+/)
    .at(-1) ?? '';

interface One {
  intent: 'ring' | 'ask' | null;
  name?: string;
  rename?: string;
  span?: [number, number];
}

/** Fillers right after "call me" ("um", "back", "right now"): a sign the name after is said to them. */
function skipFillers(rest: string): { rest: string; fillers: number } {
  let fillers = 0;
  for (let f = FILLER_AT.exec(rest); f; f = FILLER_AT.exec(rest)) {
    rest = rest.slice(f[0].length);
    fillers++;
  }
  return { rest, fillers };
}

interface Around {
  before: string;
  imperative: boolean;
  fillers: number;
  comma: boolean;
  word: string;
  after: string;
  span: [number, number];
}

/** A word like a team name after "call me": a call, a question, a name to confirm, or only a span to skip. */
function decide(a: Around, team: string, persona: string): One {
  const cue = (RENAME_BEFORE.test(a.before) && !ASKER.test(a.before)) || RENAME_AFTER.test(a.after);
  if (a.fillers > 0) return { intent: a.imperative ? 'ring' : null, span: a.span };
  if (cue && !(a.comma && team === persona)) return { intent: null, rename: a.word };
  if (!a.imperative) return { intent: null, span: a.comma ? a.span : undefined };
  if (a.word.toLowerCase() === persona) return { intent: 'ring', span: a.span };
  return { intent: 'ask', name: a.word, span: a.span };
}

/** "call me" at [at, end): its reading, or null for "call me Sam" / "call me later" / "don't call me". */
function readOne(words: string, at: number, end: number, persona: string): One | null {
  const before = clauseBefore(words, at);
  if (NEGATED.test(before)) return null;
  const { rest, fillers } = skipFillers(words.slice(end));
  if (LATER.test(rest)) return null;
  const lastWord = before.trim().split(/\s+/).at(-1) ?? '';
  const imperative = IMPERATIVE.test(before) || personaLike(lastWord) !== null;
  const word = WORD_AT.exec(rest);
  if (!word) return imperative ? { intent: 'ring', span: [at, end] } : null;
  const team = personaLike(word[1]);
  if (!team) return null;
  const span: [number, number] = [at, words.length - rest.length + word[0].length];
  const comma = /^\s*,/.test(words.slice(end));
  const after = rest.slice(word[0].length);
  return decide({ before, imperative, fillers, comma, word: word[1], after, span }, team, persona);
}

/** "did you call me (, Ferni)?": a plain question about a call; "did you just call me crazy?" is not. */
function didYouCall(words: string): boolean | null {
  if (!new RegExp(ASKS_IF_CALLED, 'iu').test(words)) return null;
  const plain = new RegExp(
    String.raw`${ASKS_IF_CALLED}${WHEN}(?:[\s,]+([\p{L}]+))?\s*(?:[?.!]|$)`,
    'iu'
  );
  const m = plain.exec(words);
  return !!m && (!m[1] || personaLike(m[1]) !== null);
}

/** "ring me", "give me a call", "call my cell", not negated and not for later. */
function asksForRing(words: string): boolean {
  return RING_PHRASES.some((re) =>
    [...words.matchAll(re)].some((m) => {
      const at = m.index ?? 0;
      return !NEGATED.test(clauseBefore(words, at)) && !LATER.test(words.slice(at + m[0].length));
    })
  );
}

/** One "call me" into the turn's reading: a ring wins over a question. */
function merge(out: CallMeReading, one: One): void {
  if (one.span) out.spans.push(one.span);
  if (one.rename) out.rename ??= one.rename;
  if (one.intent === 'ring') out.intent = 'ring';
  if (one.intent === 'ask' && out.intent === null) {
    out.intent = 'ask';
    out.name = one.name;
  }
}

/** What "call me ..." / "did you call me?" in `words` asks of `persona` (its first name, any case). */
export function readCallMe(words: string, persona: string): CallMeReading {
  const own = persona.trim().toLowerCase();
  if (!words || !own) return { intent: null, spans: [] };
  const asked = didYouCall(words);
  if (asked !== null) return { intent: asked ? 'did-you-call' : null, spans: [] };
  const out: CallMeReading = { intent: asksForRing(words) ? 'ring' : null, spans: [] };
  for (const m of words.matchAll(/\bcall\s+me\b/gi)) {
    const at = m.index ?? 0;
    const one = readOne(words, at, at + m[0].length, own);
    if (one) merge(out, one);
  }
  if (out.intent === 'ring') delete out.name;
  return out;
}

/** The words with each vocative span blanked, so name capture never reads "call me, Ferni" as a name. */
export function withoutVocatives(words: string, spans: ReadonlyArray<[number, number]>): string {
  let text = words;
  for (const [start, end] of [...spans].sort((a, b) => b[0] - a[0]))
    text = `${text.slice(0, start)}.${text.slice(end)}`;
  return text;
}
