/**
 * The legacy word checks outside the crisis gate, under CRISIS_LEXICAL_V2 (off by default).
 *
 * Two older detectors read every caller turn with plain regexes and add crisis guidance
 * on their own, with no classifier and no agreement gate: performSafetyCheck
 * (crisis-detection.ts) and the human-transfer detector (human-transfer/
 * escalation-classifier.ts). Measured on main: "I got messages from my sister" read as
 * psychosis ("needs crisis support NOW"), "what's the point of this meeting" as suicide
 * (988), "I cut my finger, I'm bleeding" as 911.
 *
 * The rule: no exclusion ever silences a real risk phrase, and no line gets less than main
 * gave it unless it is a known false-alarm shape. So, with the flag on:
 * - STRONG_RISK runs first, on the whole turn. A turn holding any strong phrase ("want to
 *   die", "end it", "kill myself", "can't go on"...) gets main's patterns, plus the fixed
 *   ones, with no exclusion at all. Safety beats false alarms: "ending it with my
 *   boyfriend" keeps main's alarm.
 * - Otherwise a weak trigger is skipped when it is negated in its clause (the guard's
 *   NEGATION_PREFIX, plus wasn't / haven't / "can't imagine"; never "can't stop" or a bare
 *   "no"), when "the point" or "go on" is followed by an everyday object ("of this
 *   meeting", "that trip"), when an injury hit's own clause is an everyday injury (a cut
 *   finger while cooking) and nothing in the turn is serious or deliberate, or when
 *   "losing it" is game or event talk. Event words never cancel panic, medical or self-harm.
 * - Two of main's patterns are fixed (FIXED): "messages from" needs a voice source, and
 *   "overdos" is a whole word ("took too many" is not about photos).
 *
 * The human-transfer note for suicide or self-harm defers to the gate only when the gate is
 * sure to act on the same line: the flag is on, the gate is live on the cascade path (the
 * realtime models reply without it), and the gate's own pattern guard reads crisis in the
 * line (gateSees). A classifier timeout can then never leave a real line with nothing.
 * performSafetyCheck never defers: its suicide signal is the guard's own read, and its
 * 'safety' note also steers turn 1 and the conversation mode. Each skip and deferral is
 * logged (CRISIS_LEXICAL, a reason code only). The crisis_signals write is unchanged (#3150).
 *
 * @module services/safety/legacy-word-checks
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { getProviderIdSync } from '../../config/model-provider-config.js';
import { createLogger } from '../../utils/safe-logger.js';
import { detectCrisis as guardRead } from './crisis-guard.js';
import { resolveCrisisGuardMode } from './crisis-guard-mode.js';
import { CLAUSE_BREAK, NEGATION_PREFIX } from './crisis-modifiers.js';
import { FIRST_PERSON_ENDING } from './crisis-patterns.js';
import { alwaysHold, EVENTS } from './crisis-release-words.js';

const log = createLogger({ module: 'LegacyWordChecks' });

export type WordCheck = 'safety_check' | 'human_transfer';
type Skip = 'negated' | 'idiom' | 'injury' | 'event_talk' | 'fixed_pattern' | 'deferred_to_gate';

/** A legacy pattern: a regex, or SENSE_LOSS_MEDICAL (sight-emergency.ts reads the flag itself). */
export interface WordPattern {
  readonly source: string;
  test: (text: string) => boolean;
}

const lexicalV2On = (env: Env): boolean => flagOn('CRISIS_LEXICAL_V2', env);

/** One counted event: the check, the reason and the pattern's kind. Never the caller's words. */
export function noteWordCheck(check: WordCheck, reason: Skip, kind: string): void {
  log.info({ check, reason, kind }, 'CRISIS_LEXICAL');
}

/**
 * Real risk, said outright. Any one in a turn turns every exclusion off for that turn,
 * negated or not, whatever follows it. One list for both detectors; the guard's ending floor
 * (kill myself, end my life, end it all, take my life, commit suicide) is reused as is.
 */
const STRONG_RISK: readonly RegExp[] = [
  FIRST_PERSON_ENDING,
  /\b(?:want(?:s|ed|ing)?|wanna) to die\b/,
  /\bend(?:ing)? it\b/,
  /\b(?:don'?t|do not|didn'?t) want to (?:be (?:here|alive|around)|live|exist|wake up)\b/,
  /\b(?:kill|hurt|harm|burn)(?:s|ed|ing)? my ?self\b/,
  /\bno reason (?:to|for me to) (?:live|be here|go on|keep going)\b/,
  /\bbetter off without me\b/,
  /\bno ?one (?:would|will) (?:care|miss me|notice)\b/,
  /\bcan'?t (?:go on|keep going|cope anymore|do this anymore|take (?:it|this) anymore)\b/,
  /\bbreaking point\b/,
  /\bpoint (?:in|of) (?:living|life|being alive|existing|going on|my (?:life|existence)|(?:a|any|my) future)\b/,
  /\bgo on (?:like this|another day|living|anymore)\b/,
  /\bwon'?t be (?:here|around) (?:tomorrow|much longer|anymore|for long)\b/,
  /\bsuicid\w*/,
];

const VOICE_SOURCE = String.raw`(?:god|the devil|satan|demons?|angels?|aliens?|spirits?|ghosts?|the dead|the (?:tv|television|radio|universe|other side))`;
const NOT_A_DOSE = String.raw`(?:photos?|pictures?|pics|selfies|videos?|notes|classes|courses|credits|days off|breaks|naps|steps|questions|chances|risks|calls|meetings|shifts|hours|time|turns|bites)`;

/** Main's patterns with a grouping or substring bug (crisis-detection.ts), by source, and the fix. */
const FIXED = new Map<string, RegExp>([
  [
    String.raw`\b(god.*(told|telling) me to|messages from)\b`,
    new RegExp(
      String.raw`\bgod\b.*\b(?:told|telling) me to\b|\bmessages from ${VOICE_SOURCE}\b`,
      'i'
    ),
  ],
  [
    String.raw`\b(overdos|od.?ing|took too (much|many))\b`,
    new RegExp(
      String.raw`\b(?:overdos\w*|od.?ing\b|took (?:way )?too (?:much|many)\b(?! ${NOT_A_DOSE}\b))`,
      'i'
    ),
  ],
]);

/** Negations the guard's NEGATION_PREFIX leaves out. Never "can't stop" or "can't help". */
const MORE_NEGATION =
  /\b(?:wasn'?t|weren'?t|aren'?t|haven'?t|hasn'?t|hadn'?t|(?:can'?t|cannot|couldn'?t) (?:ever |even )?(?:imagine|picture|see myself))\s+(?:(?:really|actually|even|ever|been|going|to|i|would|want|wanting)\s+)*$/;

function negated(lower: string, start: number): boolean {
  const clause = lower.slice(0, start).split(CLAUSE_BREAK).pop()?.trim() ?? '';
  const prefix = clause ? `${clause} ` : '';
  return NEGATION_PREFIX.test(prefix) || MORE_NEGATION.test(prefix);
}

const DET = String.raw`(?:a|an|the|this|that|these|those|our|your|his|her|their|my)`;
const OUTING = String.raw`(?:trip|date|vacation|holiday|hike|cruise|tour|walk|ride|run|diet|break)`;
/** The weak open-ended phrases and the everyday object that may follow them. */
const EVERYDAY_AFTER: ReadonlyArray<[RegExp, RegExp]> = [
  [/\bpoint$/, new RegExp(String.raw`^ (?:of|in|about) ${DET} [a-z]`)],
  [/\bgo on$/, new RegExp(String.raw`^ ${DET} (?:\w+ )?(?:${OUTING}|${[...EVENTS].join('|')})\b`)],
];
/** Life itself after the phrase keeps it ("the point of this life", "in this body"). */
const EXISTENCE = /\b(?:world|earth|planet|body|skin|life|pain|head|existence|future)\b/;

function everydayObject(lower: string, start: number, matched: string): boolean {
  const after = EVERYDAY_AFTER.find(([phrase]) => phrase.test(matched))?.[1];
  const rest = lower.slice(start + matched.length).split(/[.!?;,]|\bbut\b/)[0] ?? '';
  return !!after && after.test(rest) && !alwaysHold(rest) && !EXISTENCE.test(rest);
}

/** Clauses: sentences, commas and the conjunctions a caller strings them with. */
const CLAUSE = /[.!?;,]|\b(?:and|but|then|now|so)\b/;
const clauseAt = (lower: string, start: number): string =>
  `${lower.slice(0, start).split(CLAUSE).pop()}${lower.slice(start).split(CLAUSE)[0]}`;

const EVERYDAY_INJURY =
  /\b(?:cut|sliced|nicked|scraped|scratched|burn(?:ed|t)?|pricked|stubbed|bumped|banged|jammed) (?:my|myself)\b[^.!?]{0,40}?\b(?:chopping|cutting|slicing|peeling|shaving|cooking|baking|gardening|opening|on (?:the|a) (?:stove|oven|pan|grill|iron|fence|nail|glass|corner|door|can))\b|\b(?:cut|sliced|nicked|scraped|burn(?:ed|t)?|stubbed) my (?:finger|thumb|hand|toe|knee|lip|chin)\b|\b(?:paper cut|nosebleed|nose bleed)\b/;
const SERIOUS_INJURY =
  /\b(?:a lot|so much|won'?t stop|can'?t stop|everywhere|heavily|pouring|gushing|spurting|losing blood|deep|to the bone|stitches|stab\w*|shot|pass(?:ed|ing)? out|faint\w*|dizzy)\b/;
const HARM_INTENT =
  /\b(?:on purpose|deliberately|intentionally|meant to|wanted to|want to|to feel|deserve|punish\w*|again|relapse\w*|urges?|at night|every night)\b/;
/** "I'm bleeding" on its own, which an everyday injury clause elsewhere in the turn explains. */
const BARE_BLEEDING = /^\s*(?:i'?m|i am) bleeding(?: a (?:little|bit|little bit))?\s*$/;

/** The hit's own clause is an everyday injury, and nothing in the turn is serious or deliberate. */
function everydayInjury(lower: string, start: number): boolean {
  if (SERIOUS_INJURY.test(lower) || HARM_INTENT.test(lower)) return false;
  const clause = clauseAt(lower, start);
  if (EVERYDAY_INJURY.test(clause)) return true;
  return BARE_BLEEDING.test(clause) && lower.split(CLAUSE).some((c) => EVERYDAY_INJURY.test(c));
}

/** "Losing it" about a game or an event, with no risk word anywhere in its sentence. */
function eventTalk(lower: string, start: number): boolean {
  const sentence = `${lower.slice(0, start).split(/[.!?]/).pop()}${lower.slice(start).split(/[.!?]/)[0]}`;
  const named = sentence.split(/[^a-z']+/).some((w) => EVENTS.has(w.replace(/'s$/, '')));
  return named && !alwaysHold(sentence);
}

const INJURY_KINDS = new Set(['medical', 'self-harm']);

function skipOf(lower: string, start: number, matched: string, kind: string): Skip | null {
  if (negated(lower, start)) return 'negated';
  if (kind === 'suicidal' && everydayObject(lower, start, matched)) return 'idiom';
  if (INJURY_KINDS.has(kind) && everydayInjury(lower, start)) return 'injury';
  if (kind === 'severe_distress' && matched === 'losing it' && eventTalk(lower, start)) {
    return 'event_talk';
  }
  return null;
}

/**
 * Whether a legacy pattern hits `text`. Flag off: `pattern.test(text)`, exactly main.
 * Flag on: with a strong phrase in the turn, main's hit or the fixed pattern's; without one,
 * any match that is not skipped (see the module comment).
 */
export function wordsMatch(
  pattern: WordPattern,
  text: string,
  kind: string,
  check: WordCheck,
  env: Env = process.env
): boolean {
  if (!lexicalV2On(env) || !(pattern instanceof RegExp)) return pattern.test(text);
  const lower = text.toLowerCase().replace(/[‘’ʼ]/g, "'");
  const fixed = FIXED.get(pattern.source);
  if (STRONG_RISK.some((re) => re.test(lower))) return pattern.test(text) || !!fixed?.test(lower);
  let skip: Skip | null = null;
  const re = fixed ?? pattern;
  for (const m of lower.matchAll(new RegExp(re.source, `${re.flags.replace('g', '')}g`))) {
    skip = skipOf(lower, m.index, m[0], kind);
    if (!skip) return true;
  }
  if (!skip && fixed && pattern.test(lower)) skip = 'fixed_pattern';
  if (skip) noteWordCheck(check, skip, kind);
  return false;
}

/** The gate's own pattern guard reads crisis in these words, so the live gate acts on them. */
const gateSees = (text: string): boolean => guardRead(text).isCrisis;

/**
 * The flag is on, the gate is live on the cascade path (the realtime models reply without
 * it), and its pattern guard reads crisis in `text`: the gate is sure to act on this line.
 */
export function gateDecides(text: string, env: Env = process.env): boolean {
  return (
    lexicalV2On(env) &&
    resolveCrisisGuardMode(env) === 'live' &&
    getProviderIdSync(env) === 'cartesia-cascade' &&
    gateSees(text)
  );
}
