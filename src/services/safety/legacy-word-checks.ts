/**
 * The legacy word checks outside the crisis gate, under CRISIS_LEXICAL_V2 (off by default).
 *
 * Two older detectors read every caller turn with plain regexes and add crisis guidance
 * on their own, with no classifier and no agreement gate: performSafetyCheck
 * (crisis-detection.ts) and the human-transfer detector (human-transfer/
 * escalation-classifier.ts). Measured on main: "I got messages from my sister" read as
 * psychosis ("needs crisis support NOW"), "what's the point of this meeting" and "I'm
 * ending it with my boyfriend" as suicide (988), "I cut my finger, I'm bleeding" as 911.
 *
 * With the flag on, a pattern hit stands unless
 * - it is negated in its clause: the guard's NEGATION_PREFIX, plus wasn't / haven't /
 *   "can't imagine". "Can't stop" is no negation, and neither is a bare "no": speech to
 *   text drops the comma in "no, I want to die";
 * - a suicide hit is an everyday idiom: ENDING_IDIOMS, or an everyday object right after
 *   an open-ended phrase ("the point of this meeting", "ending it with my boyfriend",
 *   "go on that trip") holding no ALWAYS_HOLD word (EVERYDAY_AFTER);
 * - an injury hit is an everyday injury (a cut finger while cooking) with no sign it is
 *   serious or deliberate: first aid, not 911 or 988;
 * - a distress or panic hit is talk about a game or an event (EVENTS), no ALWAYS_HOLD word.
 * Two of main's patterns are replaced (FIXED): "messages from" needs a voice source
 * (main's grouping made any "messages from" psychosis), "overdos" is a whole word, and
 * "took too many" is not about photos or classes.
 *
 * With the gate live, suicide, self-harm and distress are the gate's: it reads the same
 * caller words with the same guard patterns and the classifier, so these checks stop
 * adding their own guidance for them. A hit is not fed into the gate: the gate takes no
 * outside input, and forcing its decision from a word hit is the false alarm itself.
 * Each skip and deferral is logged (CRISIS_LEXICAL, a reason code only). With the gate
 * off or in shadow the checks keep main's guidance. The human-transfer crisis_signals
 * write stays until the gate writes them (#3150).
 *
 * @module services/safety/legacy-word-checks
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { CrisisSignal, CrisisType } from './crisis-detection.js';
import { resolveCrisisGuardMode } from './crisis-guard-mode.js';
import { CLAUSE_BREAK, NEGATION_PREFIX } from './crisis-modifiers.js';
import { ENDING_IDIOMS } from './crisis-patterns.js';
import { alwaysHold, EVENTS } from './crisis-release-words.js';

const log = createLogger({ module: 'LegacyWordChecks' });

export type WordCheck = 'safety_check' | 'human_transfer';
type Skip = 'negated' | 'idiom' | 'injury' | 'event_talk' | 'fixed_pattern' | 'deferred_to_gate';

/** A legacy pattern: a regex, or SENSE_LOSS_MEDICAL (sight-emergency.ts reads the flag itself). */
export interface WordPattern {
  readonly source: string;
  test: (text: string) => boolean;
}

export function lexicalV2On(env: Env = process.env): boolean {
  return flagOn('CRISIS_LEXICAL_V2', env);
}

/** The flag is on and the gate is live: the gate decides suicide, self-harm and distress. */
export function gateDecides(env: Env = process.env): boolean {
  return lexicalV2On(env) && resolveCrisisGuardMode(env) === 'live';
}

/** One counted event: the check, the reason and the pattern's kind. Never the caller's words. */
export function noteWordCheck(check: WordCheck, reason: Skip, kind: string): void {
  log.info({ check, reason, kind }, 'CRISIS_LEXICAL');
}

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

const DET = String.raw`(?:a|an|the|this|that|these|those|our|your|his|her|their|my|another)`;
const KIN = String.raw`(?:boyfriend|girlfriend|husband|wife|partner|ex|fianc\w*|roommate|friend|boss|landlord|lease|job|team|band)`;
/**
 * The everyday object after an open-ended phrase, by its last words: "the point of this
 * meeting", "ending it with my boyfriend" or "there", "go on that trip", "be here at this
 * party", and "die" only as the guard's own idioms (laughing, of, from, for). "Kill
 * myself" is exempt only by ENDING_IDIOMS. A place or a means never exempts "end it".
 */
const EVERYDAY_AFTER: ReadonlyArray<[RegExp, RegExp]> = [
  [/\bpoint$/, new RegExp(String.raw`^ (?:of|in|about) ${DET} [a-z]`)],
  [
    /\bend(?:ing)? it$/,
    new RegExp(
      String.raw`^ with (?:him|her|them)\b|^ with (?:my|our|his|her|their) (?:\w+ )?${KIN}\b|^ (?:there|here)\b|^ for (?:today|now|the day|this week)\b`
    ),
  ],
  [/\bgo on$/, new RegExp(String.raw`^ ${DET} [a-z]`)],
  [/\bbe here$/, new RegExp(String.raw`^ (?:at|for|in|on) ${DET} [a-z]`)],
  [/\bdie$/, /^ (?:laughing|of|from|for)\b/],
];
/** Life itself after the phrase keeps it ("be here in this world", "in this body"). */
const EXISTENCE = /\b(?:world|earth|planet|body|skin|life|pain|head)\b/;

function everydayIdiom(lower: string, start: number, matched: string): boolean {
  const ending = matched.search(/\b(?:kill|end)/);
  if (ending >= 0 && ENDING_IDIOMS.some((re) => re.test(lower.slice(start + ending)))) return true;
  const rest = lower.slice(start + matched.length).split(/[.!?;,]|\bbut\b/)[0] ?? '';
  const after = EVERYDAY_AFTER.find(([phrase]) => phrase.test(matched))?.[1];
  return !!after && after.test(rest) && !alwaysHold(rest) && !EXISTENCE.test(rest);
}

const EVERYDAY_INJURY =
  /\b(?:cut|sliced|nicked|scraped|scratched|burn(?:ed|t)?|pricked|stubbed|bumped|banged|jammed) (?:my|myself)\b[^.!?]{0,40}?\b(?:chopping|cutting|slicing|peeling|shaving|cooking|baking|gardening|opening|on (?:the|a) (?:stove|oven|pan|grill|iron|fence|nail|glass|corner|door|can))\b|\b(?:cut|sliced|nicked|scraped|burn(?:ed|t)?|stubbed) my (?:finger|thumb|hand|toe|knee|lip|chin)\b|\b(?:paper cut|nosebleed|nose bleed)\b/;
const SERIOUS_INJURY =
  /\b(?:a lot|so much|won'?t stop|can'?t stop|everywhere|heavily|pouring|gushing|spurting|losing blood|deep|to the bone|stitches|stab\w*|shot|pass(?:ed|ing)? out|faint\w*|dizzy)\b/;
const HARM_INTENT =
  /\b(?:on purpose|deliberately|intentionally|meant to|wanted to|want to|to feel|deserve|punish\w*|again|relapse\w*|urges?)\b/;

const everydayInjury = (lower: string): boolean =>
  EVERYDAY_INJURY.test(lower) && !SERIOUS_INJURY.test(lower) && !HARM_INTENT.test(lower);

function eventTalk(lower: string, start: number): boolean {
  const sentence = `${lower.slice(0, start).split(/[.!?]/).pop()}${lower.slice(start).split(/[.!?]/)[0]}`;
  const named = sentence.split(/[^a-z']+/).some((w) => EVENTS.has(w.replace(/'s$/, '')));
  return named && !alwaysHold(sentence);
}

const IDEATION_KINDS = new Set(['suicidal']);
const INJURY_KINDS = new Set(['medical', 'self-harm']);
const EVENT_KINDS = new Set(['severe_distress', 'panic_attack']);

function skipOf(lower: string, start: number, matched: string, kind: string): Skip | null {
  if (negated(lower, start)) return 'negated';
  if (IDEATION_KINDS.has(kind) && everydayIdiom(lower, start, matched)) return 'idiom';
  if (INJURY_KINDS.has(kind) && everydayInjury(lower)) return 'injury';
  if (EVENT_KINDS.has(kind) && eventTalk(lower, start)) return 'event_talk';
  return null;
}

/**
 * Whether a legacy pattern hits `text`. Flag off: `pattern.test(text)`, exactly main.
 * Flag on: any one match that is not skipped (see the module comment).
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
  const fixed = FIXED.get(pattern.source) ?? pattern;
  let skip: Skip | null = null;
  for (const m of lower.matchAll(new RegExp(fixed.source, `${fixed.flags.replace('g', '')}g`))) {
    skip = skipOf(lower, m.index, m[0], kind);
    if (!skip) return true;
  }
  if (!skip && fixed !== pattern && pattern.test(lower)) skip = 'fixed_pattern';
  if (skip) noteWordCheck(check, skip, kind);
  return false;
}

/** What the gate reads itself: suicide and self-harm (the same guard patterns), and distress. */
const GATE_TYPES: ReadonlySet<CrisisType> = new Set([
  'suicidal_ideation',
  'self_harm',
  'severe_distress',
]);

/** performSafetyCheck's signals, in place, without the gate's kinds when the gate decides. */
export function deferToGate(signals: CrisisSignal[], env: Env = process.env): void {
  if (!gateDecides(env)) return;
  for (let i = signals.length - 1; i >= 0; i -= 1) {
    if (!GATE_TYPES.has(signals[i].type)) continue;
    noteWordCheck('safety_check', 'deferred_to_gate', signals[i].type);
    signals.splice(i, 1);
  }
}
