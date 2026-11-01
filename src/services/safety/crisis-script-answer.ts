/**
 * The caller's answer to the 911 script (CRISIS_BRAKE_V2=on, off by default). Prod, 10-17 to
 * 10-31: the next "yes", "no" or "it's not a crisis" was read imminent again, up to 6 scripts in a
 * row. With the flag on, a short answer right after the script is an answer, and a bare yes or no
 * means what the script's question makes it mean (QUESTIONS, crisis-script-questions.ts): a yes to
 * "if you've taken something" and a no to "is anyone nearby" are both risk. The script asks both,
 * so a bare yes is 'risk' (the full script) and a bare no is 'main' (never eased).
 *
 * A safe answer ("I'm fine", "it's not a crisis", "I haven't taken anything", or a bare yes or no
 * whose every question makes it safe) is a check-in, 'safe', only when it carries no pattern, risk
 * or held word and the caller's own earlier lines carry no risk either (hasCallerRiskContent, as
 * the agreement gate reads them). Otherwise, and for any answer with a risk word, a question or a
 * hesitation, it is 'main': the turn reads exactly as on main, line and all, never held. Anything
 * that is not a short answer: null.
 *
 * @module CrisisScriptAnswer
 */

import { hasCallerRiskContent, hasRiskContent, mentionsMeans } from './crisis-agreement.js';
import { crisisBrakeOn } from './crisis-brake.js';
import { clearNo } from './crisis-grounded-screen.js';
import {
  applyClassifierVerdict,
  detectCrisis,
  type CrisisDetectionResult,
} from './crisis-guard.js';
import { SCRIPT_YES, type LineTurn } from './crisis-line-once.js';
import { alwaysHold, wordsOf } from './crisis-release-words.js';
import { ANYONE_NEARBY, TAKEN_OR_IN_DANGER } from './crisis-script-questions.js';

type Meaning = 'risk' | 'safe';
/** What a bare yes to each of the script's own questions means; a bare no means the other. */
const QUESTIONS: ReadonlyArray<readonly [question: string, yes: Meaning]> = [
  [TAKEN_OR_IN_DANGER, 'risk'],
  [ANYONE_NEARBY, 'safe'],
];
const flat = (text: string): string => text.toLowerCase().replace(/[‘’]/g, "'");

/** What a bare yes means for each script question Ferni's line asked; empty when it asked none. */
function yesMeanings(companion: string | undefined): Meaning[] {
  if (typeof companion !== 'string') return [];
  const line = flat(companion);
  return QUESTIONS.filter(([q]) => line.includes(flat(q))).map(([, yes]) => yes);
}

const LEAD = '(?:um|uh|well|oh|ferni|fern|look|okay|ok)';
const YES_WORD = '(?:yes|yeah|yep|yup|yea)';
const NO_WORD = '(?:no|nope|nah|nobody|not anyone)';
/** Starts with a yes or a no: read by the question's meaning before anything else. */
const STARTS_YES = new RegExp(`^(?:${LEAD} )*${YES_WORD}\\b`);
const STARTS_NO = new RegExp(`^(?:${LEAD} )*${NO_WORD}\\b`);
/** Only a yes or a no ("no one", "nope, nobody"): the bare answers that may be safe. */
const BARE = new RegExp(
  `^(?:${LEAD} )*(?:${YES_WORD}|${NO_WORD}|no\\s*one)(?: (?:no\\s*one|nobody|thanks))*$`
);
/** A hedge or a taken-it answer: risk whichever question it answers. */
const RISK_ANSWER = new RegExp(
  `^(?:${LEAD} )*(?:i did|i have|i took|i've taken|kind of|sort of|maybe|not really)\\b|\\bi (?:took|swallowed|have taken|'ve taken)\\b`
);
/** An answer to the first question alone, whatever "no" came before it. */
const TOOK_NOTHING =
  /\bi (?:haven'?t|have not) taken anything\b|\bi (?:didn'?t|did not) take anything\b/;
const FILLER = `(?:(?:${LEAD}|no|nope|nah) )*`;
/** "I'm fine", "it's not a crisis", "I meant the bake sale": never "I meant it". */
const STATEMENT =
  "(?:i'?m (?:fine|okay|ok|good|safe|alright|all right)|i'?m not in danger|it'?s not (?:a crisis|like that)|not a crisis|that'?s not what i meant|i didn'?t mean (?:it|that) like that|i meant something else|i (?:just )?meant (?:the|my|our|a) [a-z']+(?: [a-z']+)?|i (?:haven'?t|have not) taken anything|i (?:didn'?t|did not) take anything)";
const TAIL = '(?: (?:i promise|really|honestly|thanks|thank you|ferni))*';
const SAID_NO = new RegExp(`^${FILLER}${STATEMENT}(?: ${STATEMENT})*${TAIL}$`);

export interface ScriptAnswerTurn {
  latest: string;
  /** Ferni's line just before. */
  companion?: string;
  earlier: readonly string[];
  call?: string;
  env?: Record<string, string | undefined>;
}

/** What a no must not carry: a question, a hesitation, a risk or held word, a pattern. */
function carriesRisk(latest: string): boolean {
  if (/[?¿]|\.\.|…/.test(latest) || alwaysHold(latest) || hasRiskContent(latest)) return true;
  const found = detectCrisis(latest);
  return found.severity > 0 || found.indicators.length > 0;
}

/**
 * 'risk': the full 911 script. 'safe': a check-in. 'main': the turn reads as on main, never held
 * or eased. null when this is not a short answer to the script.
 */
export type ScriptAnswer = 'risk' | 'safe' | 'main';

/** The answer to the script, or null. */
export function scriptAnswer(turn: ScriptAnswerTurn): ScriptAnswer | null {
  try {
    const { latest, call, env } = turn;
    const asked = crisisBrakeOn(env, call, [latest, ...turn.earlier])
      ? yesMeanings(turn.companion)
      : [];
    if (asked.length === 0) return null;
    const words = wordsOf(latest.replace(/[‘’]/g, "'"));
    if (!words || words.length === 0 || words.length > 12) return null;
    const text = words.join(' ');
    if (RISK_ANSWER.test(text) || mentionsMeans(latest)) return 'risk';
    if (STARTS_YES.test(text) && asked.includes('risk')) return 'risk';
    if (carriesRisk(latest)) return 'main'; // a risk word, a question, a hesitation: as on main
    const tookNothing = TOOK_NOTHING.test(text);
    // A no to "is anyone nearby" is being alone: a risk answer, never eased.
    if (STARTS_NO.test(text) && !tookNothing && asked.includes('safe')) return 'main';
    if (!BARE.test(text) && !clearNo(latest) && !SAID_NO.test(text)) return null;
    return turn.earlier.some(hasCallerRiskContent) ? 'main' : 'safe';
  } catch {
    return null; // the reads decide
  }
}

/**
 * Once per turn, for the reply gate and the turn pipeline alike: the answer to the 911 script,
 * and the turn crisis-line-once.ts reads (a 'main' answer is never held).
 */
export function briefTurn(turn: ScriptAnswerTurn & Pick<LineTurn, 'ferni' | 'patterns'>): {
  answer: ScriptAnswer | null;
  once: LineTurn;
} {
  const answer = scriptAnswer(turn);
  const { call, latest, earlier, ferni, patterns, env } = turn;
  return {
    answer,
    once: { call, latest, earlier, ferni, patterns, env, fullLine: answer === 'main' },
  };
}

/** The imminent read a risk answer gives: the full 911 script, never held back (crisis-line-once.ts). */
export function answeredYes(patterns: CrisisDetectionResult): CrisisDetectionResult {
  const imminent = applyClassifierVerdict(patterns, { risk: 'imminent', subject: 'self' });
  return { ...imminent, indicators: [...imminent.indicators, SCRIPT_YES] };
}

/** The guidance for a safe answer. */
export const SCRIPT_ANSWER_CHECKIN = `[SAFETY - CHECK-IN]
You asked whether they had taken something or were in danger right now, and they said no.
1. Believe them and thank them for answering; do not repeat the script, 911 or 988
2. Stay warm and present, check in once on how they're doing right now, and follow their lead
3. If they say anything about having taken something, hurting themselves or not being safe, take it seriously: 911 if they're in danger now, 988 to talk to someone`;
