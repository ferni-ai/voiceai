/**
 * CRISIS_CONTEXT_V2 (off by default): one change to the crisis classifier's
 * reads, and it can only raise a verdict, never lower one.
 *
 * On a turn that answers Ferni's own crisis line or safety question, each read
 * runs twice at once: main's plain read (main's prompt, main's input, exactly
 * as with the flag off) and a marked read, where Ferni's line goes in as
 * COMPANION_CHECK_IN with one rule saying the check-in by itself is not a sign
 * of risk. The answer is the plain read, raised to the marked read's verdict
 * when that is higher and already in. The marked read never delays, replaces
 * or drops the plain one: if it is still running when the plain read lands, or
 * fails, the plain read is the answer alone.
 *
 * Nothing changes on a turn without a check-in, on a call where main's own
 * pattern detector found risk (this turn's pattern outcome, or any caller line
 * it scores at crisis level), or without a call id. A held call stays held for
 * the rest of the call (crisis-call-risk.ts), recorded before the read can be
 * skipped.
 *
 * @module CrisisContextV2
 */

import { flagOn } from '../../config/env-flag.js';
import { callNarrowingHeld, holdCallNarrowing } from './crisis-call-risk.js';
import type { CrisisGenerateFn } from './crisis-classifier.js';
import { sessionSeverityOf } from './crisis-guard.js';
import { SEVERITY } from './crisis-severity.js';
import { parseClassifierReply } from './crisis-verdict.js';

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
 * With the flag on, whether this turn's read may run the marked read beside main's. Never
 * without a call to hold (no session id); never when the patterns found risk on this turn or
 * main's detector scores one of the caller's lines (this turn's or earlier) at crisis level, and
 * never again on a call where either happened.
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

/** The marked read's prompt: main's prompt with the check-in rule; unchanged without its anchor. */
export function markedPrompt(prompt: string): string {
  const insertAt = prompt.indexOf('\n\nReturn JSON only');
  if (insertAt < 0) return prompt;
  return `${prompt.slice(0, insertAt)}\n${CHECK_IN_RULE}${prompt.slice(insertAt)}`;
}

const RANK = { none: 0, crisis: 1, imminent: 2 } as const;

/**
 * The reply to return: the plain one, unless the marked one parses (with the classifier's own
 * parser) to a valid verdict strictly higher than the plain one's. Then a fresh JSON built from
 * that parsed verdict, so nothing downstream can read it differently. Either one unparseable:
 * the plain reply.
 */
export function higherReply(plain: string, marked: string | undefined): string {
  const floor = parseClassifierReply(plain);
  const raised = marked === undefined ? null : parseClassifierReply(marked);
  if (!floor || !raised || RANK[raised.risk] <= RANK[floor.risk]) return plain;
  return JSON.stringify({ risk: raised.risk, subject: raised.subject });
}

/**
 * Main's plain read, raised to the marked read's verdict when that is higher and already in.
 * The plain read is awaited exactly as main awaits it (its failure is main's failure); the
 * marked read is never waited for.
 */
function withMarkedRead(generate: CrisisGenerateFn): CrisisGenerateFn {
  return async (prompt, content, signal) => {
    let input: { companion?: unknown };
    try {
      input = JSON.parse(content) as typeof input;
    } catch {
      return generate(prompt, content, signal);
    }
    if (typeof input.companion !== 'string' || !FERNI_CHECK_IN.test(input.companion)) {
      return generate(prompt, content, signal);
    }
    const { companion, ...rest } = input;
    let marked: string | undefined;
    generate(
      markedPrompt(prompt),
      JSON.stringify({ ...rest, COMPANION_CHECK_IN: companion }),
      signal
    )
      .then((reply) => (marked = reply))
      .catch(() => undefined);
    const plain = await generate(prompt, content, signal);
    return higherReply(plain, marked);
  };
}

/**
 * One turn's read under the flag: the model call it uses (main's when nothing changes). Main's
 * prompt is never changed. Call it before anything can skip the read, so a call with risk is
 * always held.
 */
export function contextV2Read(
  turn: { latest: string; earlier?: readonly string[]; companion?: string },
  run: { call?: string; pattern: 'block' | 'crisis' | 'none' },
  env: Env = process.env
): { generate: (g: CrisisGenerateFn) => CrisisGenerateFn } {
  const same = { generate: (g: CrisisGenerateFn) => g };
  const lines = [turn.latest, ...(turn.earlier ?? [])];
  if (!contextNarrows(lines, run.call, run.pattern !== 'none', env)) return same;
  if (!FERNI_CHECK_IN.test(turn.companion ?? '')) return same;
  return { generate: withMarkedRead };
}
