/**
 * The deterministic text side of easing a classifier-only crisis read
 * (crisis-easing-extract.ts): the code's own preparation cues, which the
 * model cannot drop, and the sentences each read on their own.
 *
 * Cues: escalateOnlyCue's families, hasRiskContent, and what the 2026-10-23
 * replays found the word lists miss: a pet rehomed ("my parrot is going to my
 * neighbor", 2026-10-23 shadow log), social media deleted, an apology texted.
 * Units: a model can be talked out of a reading by the words around it
 * ("it's for a story"), so each sentence is also read alone; a sentence under
 * four words joins its neighbour, since alone it carries no meaning to read.
 * Pure.
 *
 * @module CrisisEasingText
 */

import { hasRiskContent } from './crisis-agreement.js';
import { escalateOnlyCue, plain } from './crisis-classifier-only-text.js';

const ANIMAL =
  '(?:pets?|dogs?|doggy|pup(?:py|pies)?|cats?|kitty|kittens?|parrots?|birds?|budgies?|parakeets?|fish|goldfish|hamsters?|gerbils?|guinea pigs?|rabbits?|bunn(?:y|ies)|turtles?|tortoises?|lizards?|geckos?|snakes?|ferrets?|horses?|pony|chickens?|rats?|mice|babies)';
const REHOME =
  '(?:going|goes|go|gone|went|moving) (?:to|over to|with)|tak(?:e|es|ing|en)|took|keep(?:s|ing)?|kept|(?:a )?new (?:home|family|owner)s?|rehom\\w*|adopt\\w*|look(?:s|ing)? after|watch(?:es|ing)? (?:over )?(?:him|her|them|it)|ha(?:ve|s|ving) (?:him|her|them|it)|get(?:s|ting)? (?:him|her|them|it)|giv(?:e|es|ing|en) (?:him|her|them|it) (?:to|away)|gave (?:him|her|them|it)';
/** Preparation the code finds itself, beyond escalateOnlyCue, from the 2026-10-23 replays. */
const EASING_CUES: ReadonlyArray<readonly [string, RegExp]> = [
  // "my parrot is going to my neighbor", "a new home for the cats", "she's taking my dog"
  [
    'pet_rehoming',
    new RegExp(
      `\\b${ANIMAL}\\b.{0,60}\\b(?:${REHOME})\\b|\\b(?:${REHOME})\\b.{0,40}\\b${ANIMAL}\\b`
    ),
  ],
  // "deleted all my social media", "texted my ex sorry"
  [
    'withdrawal',
    /\b(?:deleted|deleting|delete|closed|closing|deactivated|wiped) (?:all )?(?:of )?my (?:social|socials|instagram|facebook|accounts?|profiles?|tiktok|snap\w*|twitter|photos|pictures|messages)\b/,
  ],
  [
    'farewell_apology',
    /\b(?:texted|text|messaged|told|called|wrote|emailed|telling|texting) (?:my |to my |her |him |them |everyone|everybody)?\w*(?: \w+)? (?:i'?m )?sorry\b/,
  ],
];

/** Every deterministic cue in the caller's lines, as features the model cannot drop. */
export function easingCueFeatures(callerLines: readonly string[]): string[] {
  const found = new Set<string>();
  for (const line of callerLines) {
    const cue = escalateOnlyCue(line);
    if (cue) found.add(`cue:${cue}`);
    if (hasRiskContent(line)) found.add('cue:risk_words');
    const text = plain(line);
    for (const [name, rule] of EASING_CUES) if (rule.test(text)) found.add(`cue:${name}`);
  }
  return [...found];
}

/** At most this many sentences are read on their own; more escalates. */
export const MAX_EASING_UNITS = 16;

const MIN_SENTENCE_WORDS = 4;
const SENTENCE_END = /[.!?;…]+\s*|,\s*(?=(?:but|and|so|anyway|though|plus|also)\b)/gi;
const wordCount = (text: string): number =>
  text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** One caller line's sentences, as its own text; a short one joins the sentence before it. */
function sentencesOf(line: string): string[] {
  const spans: Array<[number, number]> = [];
  let start = 0;
  for (const m of line.matchAll(SENTENCE_END)) {
    spans.push([start, m.index + m[0].length]);
    start = m.index + m[0].length;
  }
  if (start < line.length) spans.push([start, line.length]);
  const joined: Array<[number, number]> = [];
  for (const [from, to] of spans) {
    const prev = joined.at(-1);
    const short = (span: [number, number]): boolean =>
      wordCount(line.slice(...span)) < MIN_SENTENCE_WORDS;
    if (prev && (short([from, to]) || short(prev))) prev[1] = to;
    else joined.push([from, to]);
  }
  return joined.map((span) => line.slice(...span).trim());
}

/** Each sentence of each caller line: the units read on their own. */
export function easingUnits(callerLines: readonly string[]): string[] {
  const units = new Set<string>();
  for (const line of callerLines) {
    for (const sentence of sentencesOf(line)) {
      if ((sentence.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 2) units.add(sentence);
    }
  }
  return [...units];
}
