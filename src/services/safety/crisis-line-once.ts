/**
 * The crisis line in full once per call (#1464, CRISIS_BRAKE_V2). Seth, 2026-10-15: "At most one
 * full 988 mention per call ... Any NEW risk signal still gets the full response." Once Ferni's own
 * words gave a line (offersCrisisLine), a later crisis turn about the caller keeps crisis mode
 * without the number or script, unless the caller asks for it, says yes to the 911 script, or says
 * new risk (explicit words, a plan, means in hand: patterns and every means form). Only a
 * crisis-level read is held: an imminent read, from the patterns or the classifier, always gets
 * the 911 script as on main, since "I'm on the roof" can carry no pattern word at all.
 * @module CrisisLineOnce
 */

import { createLogger } from '../../utils/safe-logger.js';
import { crisisBrakeOn } from './crisis-brake.js';
import { offersCrisisLine } from './crisis-line-speech.js';
import { meansInHandRead } from './crisis-means-in-hand.js';
import { normalize } from './crisis-modifiers.js';
import { PLAN_OR_MEANS_PATTERNS } from './crisis-patterns.js';

const log = createLogger({ module: 'CrisisLineOnce' });

/** The indicator a held turn carries: the guard then guides without the line (crisis-guard.ts). */
export const LINE_GIVEN = 'crisis_line_given';
/** A yes to the script's own question (crisis-script-answer.ts): always the full line. */
export const SCRIPT_YES = 'script_answer_yes';
/** An imminent read, the patterns' or the classifier's (crisis-guard.ts): never held. */
const IMMINENT = 'imminent_danger';

export interface LineTurn {
  call?: string;
  latest: string;
  earlier: readonly string[];
  /** Ferni's lines since the caller last spoke (the reply gate), or the last one (the pipeline). */
  ferni: ReadonlyArray<string | undefined>;
  /** The patterns' read of this turn, before any classifier verdict. */
  patterns: { indicators: readonly string[] };
  /** The turn reads as on main: a no to the 911 script from a caller who said risk earlier. */
  fullLine?: boolean;
  env?: Record<string, string | undefined>;
  now?: number;
}

/** Calls whose caller heard a crisis line, in memory for 6 hours like call risk. */
const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CALLS = 2048;
const heardAt = new Map<string, number>();

/** Notes a crisis line in Ferni's words; whether this call has heard one. */
function lineHeard(turn: LineTurn): boolean {
  const { call, now = Date.now() } = turn;
  if (!call || !crisisBrakeOn(turn.env, call, [turn.latest, ...turn.earlier])) return false;
  if (turn.ferni.some((line) => typeof line === 'string' && offersCrisisLine(line))) {
    for (const [id, at] of heardAt) if (now - at > TTL_MS) heardAt.delete(id);
    const oldest = heardAt.size >= MAX_CALLS ? heardAt.keys().next().value : undefined;
    if (oldest !== undefined) heardAt.delete(oldest);
    heardAt.set(call, now);
  }
  const at = heardAt.get(call);
  return at !== undefined && now - at <= TTL_MS;
}

const LINE = '(?:(?:crisis|suicide|help|hotline) )?(?:number|line|hotline|lifeline)';
/** A crisis line by name; never "the number of times" or "the number for the plumber". */
const NAMED =
  '(?:number|hotline|lifeline|helpline|(?:crisis|suicide|help) (?:line|number|hotline))(?! (?:of|for)\\b)';
const ASKS_NUMBER = [
  new RegExp(`\\b(?:the|that|your) ${LINE} again\\b|\\bwhat(?: was| is|'s) that ${LINE}\\b`),
  new RegExp(
    `\\b(?:what(?:'s| is| was)|give me|tell me|repeat|send me|text me|remind me|say)\\b[a-z' ]{0,20}\\b${NAMED}`
  ),
  new RegExp(
    `\\b(?:can|could|may) (?:i|you) (?:have|get|give me|send me|text me)\\b[a-z' ]{0,20}\\b${NAMED}`
  ),
  /\b(?:988|nine eight eight) again\b|\bwas it (?:988|nine eight eight)\b/,
  /\bwhat (?:number|line|hotline) (?:do|should|can|would) i (?:call|text|dial|use|ring)\b/,
  /\bwho (?:do|should|can|would) i (?:call|text|ring|contact|reach|talk to|reach out to)\b/,
  /\bhow (?:do|can|should|would) i (?:reach|call|contact|text|get hold of|get a hold of|get in touch with) (?:them|someone|somebody|anyone|anybody|the line|the hotline|988|nine eight eight)\b/,
];

/** The caller asks for the crisis line again. */
export function asksForNumber(latest: string): boolean {
  const text = normalize(String(latest ?? ''))
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
  return ASKS_NUMBER.some((re) => re.test(text));
}

const NEW_RISK = new Set(['explicit_crisis_language', 'imminent_danger', 'plan_or_means']);
/** A plan the shared patterns spell one way only ("tonight's the night"); here, not there, so the
 * flag off reads exactly as main. */
const PLAN_SAID = /\btonight (?:is|'?s) the night\b/;

/** New risk in the caller's own words this turn, whatever the classifier read. */
function newRisk(turn: LineTurn): boolean {
  if (turn.patterns.indicators.some((i) => NEW_RISK.has(i))) return true;
  const text = normalize(turn.latest);
  return (
    PLAN_SAID.test(text) ||
    PLAN_OR_MEANS_PATTERNS.some((p) => p.test(text)) ||
    meansInHandRead(text, [], [], 'all') !== null
  );
}

/**
 * This turn's crisis read with the line held back when the call already heard it; the read
 * itself otherwise (same object). Call on every turn: it notes the line from Ferni's words.
 */
export function withLineOnce<
  T extends { isCrisis: boolean; indicators: string[]; subject?: string },
>(crisis: T, turn: LineTurn): T {
  try {
    if (!lineHeard(turn) || !crisis.isCrisis || crisis.subject !== 'self') return crisis;
    if (crisis.indicators.includes(IMMINENT) || turn.fullLine) return crisis; // as on main
    if (crisis.indicators.includes(SCRIPT_YES) || asksForNumber(turn.latest) || newRisk(turn)) {
      return crisis;
    }
    log.info({ indicators: crisis.indicators }, 'CRISIS_LINE_ONCE');
    return { ...crisis, indicators: [...crisis.indicators, LINE_GIVEN] };
  } catch {
    return crisis; // fail toward the full line
  }
}

/** A held turn: the guard guides it without the line and never replaces the reply. */
export const lineHeld = (crisis: { indicators?: readonly string[] }): boolean =>
  crisis.indicators?.includes(LINE_GIVEN) === true;

/** The guidance for a held turn (crisis-guard.ts buildCrisisGuidance). */
export const lineHeldGuidance = (header: string): string => `${header}

They already heard the 988 line on this call. Your response MUST:
1. Stay with them, warmly and briefly, and answer what they actually said
2. Leave out the 988 number, the crisis script and any list of resources this time
3. Give 988 again if they ask for it, and 911 too if they say they've taken something, have the means with them, or have a plan
4. NEVER be dismissive or use platitudes like "it'll be okay"

You are still their lifeline. Be fully present.`;
