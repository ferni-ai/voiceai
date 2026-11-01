/**
 * CRISIS_CONTEXT_V2 (off by default): two changes to what the crisis
 * classifier reads, and nothing else. Apart from these, its prompt and its
 * risk categories are main's.
 *
 * False crisis reads mostly follow an earlier activation on the same call:
 * Ferni says a 988 line or asks a safety question, and the next read takes
 * Ferni's own words as a sign of risk. With the flag on:
 *
 * - Ferni's own crisis line or safety question goes to the model marked as
 *   COMPANION_CHECK_IN: the companion's check-in, never evidence by itself.
 *   It is still what LATEST answers, and the caller's own words are judged
 *   exactly as on main;
 * - with SEXUAL_TOPIC_BOUNDARY on, on a call main's own sexual-topic read
 *   (sexual-boundary.ts) found sexual, sexual or adult content alone reads
 *   none.
 *
 * A call is held off both for good once main's own pattern detector finds
 * risk on it: this turn's pattern outcome, or any earlier caller line it
 * scores at crisis level. The hold is recorded before the read can be
 * skipped and lives with the call's risk record (crisis-call-risk.ts). A turn
 * with no call id is never changed. Anything unexpected falls back to main's
 * read.
 *
 * @module CrisisContextV2
 */

import { flagOn } from '../../config/env-flag.js';
import { sexualTopicConfirmed } from '../../utils/sexual-topic-hold.js';
import { callNarrowingHeld, holdCallNarrowing } from './crisis-call-risk.js';
import type { CrisisGenerateFn } from './crisis-classifier.js';
import { sessionSeverityOf } from './crisis-guard.js';
import { SEVERITY } from './crisis-severity.js';

type Env = Record<string, string | undefined>;

/** Whether main's pattern detector scores this caller line at crisis level. True on any surprise. */
function mainSeesRisk(line: unknown): boolean {
  if (typeof line !== 'string') return true;
  try {
    return sessionSeverityOf(line) >= SEVERITY.crisis;
  } catch {
    return true;
  }
}

/**
 * With the flag on, whether this turn's read may change. Never without a call to hold (no
 * session id); never when the patterns found risk on this turn or main's detector scores one
 * of the caller's lines (this turn's or earlier) at crisis level, and never again on a call
 * where either happened.
 */
export function contextNarrows(
  lines: readonly string[],
  call: string | undefined,
  patternRisk: boolean,
  env: Env = process.env
): boolean {
  if (!flagOn('CRISIS_CONTEXT_V2', env) || !call) return false;
  if (patternRisk || lines.some(mainSeesRisk)) {
    holdCallNarrowing(call);
    return false;
  }
  return !callNarrowingHeld(call);
}

/** Ferni's own crisis line or safety question: the guard's scripts and what guidance asks it to say. */
const FERNI_CHECK_IN =
  /\b988\b|nine eight eight|lifeline|crisis line|\b911\b|741741|emergency room|safe right now|somewhere safe|in danger right now|(?:hurting|killing) yourself|ending your life|thoughts of suicide/i;

const CHECK_IN_RULE = `
- COMPANION_CHECK_IN, when the input has it, is the COMPANION line, and it is the companion's own crisis line or safety question. The companion says these on its own whenever a read was unsure, so the check-in by itself is not a sign that the caller is at risk. Everything above still holds: use it as COMPANION to work out what LATEST answers, and judge the caller's own words in LATEST and EARLIER exactly as above. This never lowers risk the caller's own words carry, and never lowers imminent to crisis.`;

const SEXUAL_RULE = `
- Sexual, flirtatious or adult-topic questions and requests (dating, sex, attraction, "talk dirty", a romantic or sexy story) are not a sign of risk by themselves: when that is all LATEST is about, risk is "none". Anything else in LATEST or EARLIER (dying, self-harm, a plan or means, a goodbye, giving things away, an errand for after) is judged exactly as above. This rule is only about sexual and adult content, and never lowers imminent to crisis.`;

/**
 * The classifier prompt with the flag's rules; the prompt unchanged when it has none or no anchor.
 * `sexual`: main's own sexual-topic read (sexual-boundary.ts) found this call sexual.
 */
export function narrowedPrompt(prompt: string, checkIn: boolean, sexual: boolean): string {
  const rules = (checkIn ? CHECK_IN_RULE : '') + (sexual ? SEXUAL_RULE : '');
  const insertAt = prompt.indexOf('\n\nReturn JSON only');
  if (!rules || insertAt < 0) return prompt;
  return `${prompt.slice(0, insertAt)}\n${rules}${prompt.slice(insertAt)}`;
}

/** The model call with Ferni's check-in marked as COMPANION_CHECK_IN; unchanged otherwise. */
function markedGenerate(generate: CrisisGenerateFn): CrisisGenerateFn {
  return (prompt, content, signal) => {
    let input: { latest?: unknown; earlier?: unknown; companion?: unknown };
    try {
      input = JSON.parse(content) as typeof input;
    } catch {
      return generate(prompt, content, signal);
    }
    if (typeof input.companion !== 'string' || !FERNI_CHECK_IN.test(input.companion)) {
      return generate(prompt, content, signal);
    }
    const { companion, ...rest } = input;
    return generate(prompt, JSON.stringify({ ...rest, COMPANION_CHECK_IN: companion }), signal);
  };
}

/**
 * One turn's read under the flag: the prompt and model call it uses (main's when nothing
 * changes). Call it before anything can skip the read, so a call with risk is always held.
 */
export function contextV2Read(
  turn: { latest: string; earlier?: readonly string[]; companion?: string },
  run: { call?: string; pattern: 'block' | 'crisis' | 'none' },
  env: Env = process.env
): { prompt: (p: string) => string; generate: (g: CrisisGenerateFn) => CrisisGenerateFn } {
  const same = { prompt: (p: string) => p, generate: (g: CrisisGenerateFn) => g };
  const lines = [turn.latest, ...(turn.earlier ?? [])];
  if (!contextNarrows(lines, run.call, run.pattern !== 'none', env)) return same;
  const checkIn = FERNI_CHECK_IN.test(turn.companion ?? '');
  // Only on a call main's own sexual-topic read found sexual: unread, the rule lowered
  // preparatory turns from imminent to crisis (verify of #3287, round 2).
  const sexual = sexualTopicConfirmed(run.call, env);
  if (!checkIn && !sexual) return same;
  return {
    prompt: (p) => narrowedPrompt(p, checkIn, sexual),
    generate: checkIn ? markedGenerate : (g) => g,
  };
}
