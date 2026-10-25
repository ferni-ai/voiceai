/**
 * The caller's own name, from what they said: one extractor for every writer.
 *
 * Prod 2026-10-19: the caller said "Oh, my name's not showing." and the next
 * call greeted him with "The name on my screen says 'not'". The turn path
 * (session-manager.ts analyze -> user-learning-engine processUserTurn) took
 * the name from tracking/conversation-quality.ts, whose `/my name(?:'s| is)\s+
 * ([A-Z][a-z]+)/gi` matches lower case too (the i flag makes [A-Z] match "n"),
 * and the end-of-call save wrote profile.name = "not". Another call had the
 * caller named "Ferni". Six extractors each had their own patterns and their
 * own partial stopword and persona lists.
 *
 * A name here is a word right after a self-introduction cue ("my name is",
 * "my name's", "I'm", "I am", "call me", "I go by", "this is", "<Name> here",
 * and "it's <Name>" only in an opener that starts with a hello). The cue
 * matches in any case; the name must be capitalised as it was transcribed
 * (no i flag on the capture), must not be a common or function word, must not
 * be Ferni or a teammate (utils/teammate-talk.ts TEAM_FIRST_NAMES and their
 * speech-to-text spellings, "Fernie" included), and must not be possessive ("I'm Jess's mom").
 * A greeting said to someone ("Hey Ferni, ...") is cut before matching, so the
 * name in it is never taken. Words are matched whole, never as substrings.
 *
 * NAME_CAPTURE_STRICT=on routes the writers here; off keeps each one's old
 * patterns.
 *
 * @module utils/caller-name
 */

import { flagOn, type Env } from '../config/env-flag.js';
import { FERNI_HEARD_AS, HEARD_AS, TEAM_FIRST_NAMES } from './teammate-talk.js';
import { callMeVocativeEnabled, personaLike } from './call-me-vocative.js';

export function nameCaptureStrict(env: Env = process.env): boolean {
  return flagOn('NAME_CAPTURE_STRICT', env);
}

/** Words that follow "I'm" / "my name's" / "call me" without being a name. */
const NOT_NAMES = new Set(
  (
    'i ok okay not so just sorry good fine great well here there back home still really very sure ' +
    'glad happy sad tired actually also doing ready done calling trying looking from in at on with ' +
    'the a an and but or to of for is it its this that what who yes yeah no nope um uh oh hey hi ' +
    'hello thanks showing working going getting having talking telling saying asking coming leaving ' +
    'thinking wondering speaking listening feeling waiting driving sitting about like kind pretty ' +
    'totally always never only even almost probably maybe definitely literally basically busy free ' +
    'new old young late early down up out off over now then all your my his her their our worried ' +
    'excited nervous scared anxious stressed upset angry mad bored lonely sick hungry confused lost ' +
    'stuck curious serious kidding joking alright afraid married single divorced retired pregnant ' +
    'human real someone somebody nobody everyone everybody gonna today tonight tomorrow later ' +
    'anytime sometime nothing something anything everything me you we they he she us them ' +
    'monday tuesday wednesday thursday friday saturday sunday january february march april may june ' +
    'july august september october november december american canadian british english irish ' +
    'scottish mexican spanish french german italian indian chinese japanese korean asian black white ' +
    'latino latina jewish catholic christian muslim buddhist hindu mormon gay straight trans'
  ).split(' ')
);

/** Ferni and the teammates, with the spellings speech-to-text gives their names. */
const TEAM_NAMES = new Set<string>([
  ...TEAM_FIRST_NAMES,
  ...FERNI_HEARD_AS,
  ...Object.keys(HEARD_AS),
]);

/** Capitalised as transcribed: "Seth", "Mary-Jane"; not "seth" or "SETH". */
const CAPITALISED = /^\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)?$/u;

/** A common word ("tired", "here", "not"), too short or too long: never a name, in any case. */
export function isCommonWord(word: string): boolean {
  const w = word.trim().toLowerCase();
  return w.length < 2 || w.length > 20 || NOT_NAMES.has(w);
}

/** A common word or a team name: never the caller's name, in any case. */
export function rejectsAsName(word: string): boolean {
  return isCommonWord(word) || TEAM_NAMES.has(word.trim().toLowerCase());
}

/** A word as transcribed that can be the caller's name. */
export function acceptsSpokenName(word: string): boolean {
  return CAPITALISED.test(word) && !rejectsAsName(word);
}

const WORD = String.raw`(\p{L}+(?:-\p{L}+)?)`;
const AP = `['’]`;
/** Self-introduction cues, any case; the capture is checked apart (the i flag would let \p{Lu} match "n"). */
const CUES: readonly RegExp[] = [
  String.raw`(?:\b(?:my|(?:the\s+)?user${AP}?s?)\s+|^\s*)name(?:\s+is|${AP}s)\s+`,
  String.raw`\b(?:i${AP}?m|i am)\s+(?:actually\s+|just\s+)?`,
  String.raw`\b(?:(?:everyone|people|they|friends)\s+calls?|(?:just\s+|you can\s+|please\s+)?call)\s+me\s+`,
  String.raw`\bi go by\s+`,
  String.raw`\bthis is\s+`,
].map((cue) => new RegExp(cue + WORD, 'giu'));
/**
 * The "call me <Name>" cue. With CALL_ME_VOCATIVE=on a word like a team name after it ("call me
 * Ferney") is never taken here: it may be Ferni's name said to him, and only the confirmed path
 * (agents/personas/name-confirm.ts) may make it theirs.
 */
const CALL_ME_CUE = CUES[2];
/** "Seth here", "Seth speaking" opening the line (after any greeting). */
const HERE = new RegExp(String.raw`^\s*${WORD}\s+(?:here|speaking)\b`, 'gu');
/** "[Ff]erni|...": a team name in either first-letter case, for a case-sensitive pattern. */
const TEAM_ALT = [...TEAM_NAMES]
  .map((n) => `[${n[0].toUpperCase()}${n[0]}]${n.slice(1)}`)
  .join('|');
/**
 * A greeting at the start and the name said with it: "Hey Ferni, ...", "hi
 * ferni how are you", "Hello Sam, ...". A name that isn't a teammate goes only
 * with a comma or stop after it, so "Hi, Seth here" keeps "Seth here".
 */
const GREETING = new RegExp(
  String.raw`^\s*(?:[Oo]h\s+)?(?:[Hh]ey|[Hh]i|[Hh]iya|[Hh]ello|[Yy]o|[Gg]ood (?:morning|afternoon|evening))(?![\p{L}'’])[,!.]?\s*` +
    String.raw`(?:(?:${TEAM_ALT}|there)(?![\p{L}'’])[,!.]?\s*|\p{Lu}\p{Ll}+[,!.]\s*)?`,
  'u'
);
/** "it's Seth" right after an opening greeting ("Hi Ferni, it's Seth"). */
const OPENER_ITS = new RegExp(String.raw`^\s*it${AP}?s\s+${WORD}`, 'giu');
/** Speaking for someone else: "I'm Jess, Sam's wife" is not the account. */
const FOR_SOMEONE_ELSE =
  /\b(?:his|her|their)\s+(?:wife|husband|partner|mom|mum|mother|dad|father|son|daughter|sister|brother|friend|kid|boss|assistant)\b|\bcalling (?:for|about|on behalf of)\b/i;

export interface CallerNameMatch {
  name: string;
  /** The words the name came from, e.g. "my name is Seth". */
  phrase: string;
}

function possessive(text: string, end: number): boolean {
  return /^['’]s?\b|^['’](?=\s|$)/.test(text.slice(end));
}

function firstMatch(text: string, re: RegExp, anchored: boolean): CallerNameMatch | null {
  const vocative = re === CALL_ME_CUE && callMeVocativeEnabled();
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (anchored && text.slice(0, start).trim() !== '') return null;
    const name = m[1];
    if (!acceptsSpokenName(name) || possessive(text, start + m[0].length)) continue;
    if (vocative && personaLike(name)) continue;
    return { name, phrase: m[0].replace(/^[\s.!?,]+/, '').trim() };
  }
  return null;
}

/**
 * The name the speaker gave as their own, or null. `anchored` takes a cue only
 * at the very start (for stored facts such as "name is Seth").
 */
export function findCallerName(
  text: string,
  { anchored = false }: { anchored?: boolean } = {}
): CallerNameMatch | null {
  if (!text || FOR_SOMEONE_ELSE.test(text)) return null;
  const greeting = text.match(GREETING);
  const rest = greeting ? text.slice(greeting[0].length) : text;
  if (greeting) {
    const its = firstMatch(rest, OPENER_ITS, true);
    if (its) return its;
  }
  let best: (CallerNameMatch & { at: number }) | null = null;
  for (const re of [...CUES, HERE]) {
    const found = firstMatch(rest, re, anchored);
    const at = found ? rest.indexOf(found.phrase) : -1;
    if (found && (!best || at < best.at)) best = { ...found, at };
  }
  return best ? { name: best.name, phrase: best.phrase } : null;
}

export function extractCallerName(text: string, opts?: { anchored?: boolean }): string | null {
  return findCallerName(text, opts)?.name ?? null;
}
