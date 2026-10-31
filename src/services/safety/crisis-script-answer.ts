/**
 * The caller's answer to the 911 script's question (CRISIS_BRAKE_V2=on, off by default). The script
 * (crisis-guard.ts) asks about having "taken something"; prod, 10-17 to 10-31, the next "yes", "no"
 * or "it's not a crisis" was read imminent again, up to 6 scripts in a row. With the flag on, a
 * short answer right after it is an answer: a yes or a means word ("the pills") is imminent, the
 * full script; a clear no from closed sets ("no", "I'm fine", "it's not a crisis") with no pattern,
 * risk or held word is a check-in, never a second script; anything else, the reads decide.
 *
 * @module CrisisScriptAnswer
 */

import { hasRiskContent, mentionsMeans } from './crisis-agreement.js';
import { crisisBrakeOn } from './crisis-brake.js';
import { clearNo } from './crisis-grounded-screen.js';
import {
  applyClassifierVerdict,
  detectCrisis,
  type CrisisDetectionResult,
} from './crisis-guard.js';
import { SCRIPT_YES } from './crisis-line-once.js';
import { alwaysHold, wordsOf } from './crisis-release-words.js';

/** Ferni's line asked the script's question (or one like it). */
const ASKED =
  /\b(?:if you'?ve|have you|you've|did you) (?:taken|take|took) (?:something|anything)\b|\bin danger right now\b/;

const LEAD = '(?:um|uh|well|oh|ferni|fern|look|okay|ok)';
const YES = new RegExp(
  `^(?:${LEAD} )*(?:yes|yeah|yep|yup|yea|i did|i have|i took|i've taken|kind of|sort of|maybe)\\b`
);
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

const askedScript = (companion: string | undefined): boolean =>
  typeof companion === 'string' && ASKED.test(companion.toLowerCase().replace(/[‘’]/g, "'"));

/** 'yes', 'no', or null when this is not a short answer to the script's question. */
export function scriptAnswer(turn: ScriptAnswerTurn): 'yes' | 'no' | null {
  try {
    const { latest, call, env } = turn;
    if (!crisisBrakeOn(env, call, [latest, ...turn.earlier]) || !askedScript(turn.companion)) {
      return null;
    }
    const words = wordsOf(latest.replace(/[‘’]/g, "'"));
    if (!words || words.length === 0 || words.length > 12) return null;
    const text = words.join(' ');
    if (YES.test(text) || mentionsMeans(latest)) return 'yes';
    if (carriesRisk(latest)) return null;
    return clearNo(latest) || SAID_NO.test(text) ? 'no' : null;
  } catch {
    return null; // the reads decide
  }
}

/** The imminent read a yes gives: the full 911 script, never held back (crisis-line-once.ts). */
export function answeredYes(patterns: CrisisDetectionResult): CrisisDetectionResult {
  const imminent = applyClassifierVerdict(patterns, { risk: 'imminent', subject: 'self' });
  return { ...imminent, indicators: [...imminent.indicators, SCRIPT_YES] };
}

/** The guidance for a no. */
export const SCRIPT_ANSWER_CHECKIN = `[SAFETY - CHECK-IN]
You asked whether they had taken something or were in danger right now, and they said no.
1. Believe them and thank them for answering; do not repeat the script, 911 or 988
2. Stay warm and present, check in once on how they're doing right now, and follow their lead
3. If they say anything about having taken something, hurting themselves or not being safe, take it seriously: 911 if they're in danger now, 988 to talk to someone`;
