/**
 * CRISIS_CLASSIFIER_CHECK (off by default, cohort-capable). Prod, 2026-10-26
 * (#2168): "Yes." after a dictated message for the owner's mom read imminent
 * with no pattern; the 988 script played, and the dictated lines kept the next
 * four turns imminent. Seth's decision, the same day:
 * 1. Imminent from the classifier alone (no pattern at all, no risk on the call
 *    before, a known call) speaks CLASSIFIER_CHECK instead, once a call. The
 *    check always names 988, so no outcome withholds the line.
 * 2. Only a clear "I'm okay" (clearAnswer) to the check said in full, within
 *    CHECK_ANSWER_MS, with no pattern and no imminent or missing read, clears
 *    it, and the alarm's lines leave the classifier's window.
 * 3. Anything else (a pattern, an imminent or missing read, an unclear answer,
 *    silence, a second alarm) gets the full script at once.
 * 4. Patterns are untouched. 5. Only the words spoken change: the check is the
 *    same 'replace' decision with the alarm's kind, so every consumer still
 *    sees the imminent read. Per call, in memory; logs never carry words.
 *
 * @module CrisisClassifierCheck
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { flagOn } from '../../config/env-flag.js';
import { statesUnder18 } from '../../utils/minor-care.js';
import { createLogger } from '../../utils/safe-logger.js';
import { stripSSML } from '../../utils/text-utils.js';
import type { CrisisVerdict } from './crisis-classifier.js';
import { clearAnswer } from './crisis-classifier-check-words.js';
import type { CrisisDetectionResult } from './crisis-guard.js';

const log = createLogger({ module: 'CrisisClassifierCheck' });

type Env = Record<string, string | undefined>;

/**
 * What Ferni says instead of the script. It always names 988, so even an answer
 * that clears the alarm (a caller who masks with "I'm fine") has heard the line.
 * Voice rules: no em dashes, no ellipses.
 */
export const CLASSIFIER_CHECK =
  'Just checking in, are you safe right now? And if you ever need it, you can call or text 988 anytime, day or night.';
/** No answer by then is no answer: about 3 s to say the check, then LiveKit's 15 s away timeout. */
export const CHECK_ANSWER_MS = 20_000;
const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CALLS = 512;

/** The gate's replace decision, as far as this module reads it. */
type Replace = { action: 'replace'; script: string };
/**
 * Per call: Ferni's line the alarm turn answered (`alarm`) and the answer turn
 * answers (`answering`), the alarm's script (with its kind), the caller lines
 * read on the alarm turn (`window`), each answer read's words and whether they
 * cleared it, and `closed` once a later turn began or no answer came.
 */
interface Check {
  at: number;
  alarm: string;
  script: Replace;
  window: Set<string>;
  answering?: string;
  answers: Map<string, boolean>;
  closed: boolean;
}
const checks = new Map<string, Check>();

const loose = (text?: string): string =>
  stripSSML(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const CHECK_WORDS = loose(CLASSIFIER_CHECK);
/** Ferni's line is the check, in full and last. */
const asked = (line?: string): boolean => loose(line).endsWith(CHECK_WORDS);
/** Ferni said at least the start of the check (an interrupted reply keeps what played). */
const began = (line: string): boolean =>
  asked(line) || (CHECK_WORDS.startsWith(loose(line)) && loose(line).includes(' '));
const patternsFound = (d: CrisisDetectionResult): boolean =>
  d.isCrisis || d.severity !== 0 || d.indicators.length > 0;

function fresh(call: string | undefined, now = Date.now()): Check | undefined {
  if (!call) return undefined;
  for (const [id, kept] of checks) if (now - kept.at > TTL_MS) checks.delete(id);
  return checks.get(call);
}

const note = (outcome: string, why: string): void =>
  log.info({ outcome, why }, 'CRISIS_CLASSIFIER_CHECK');

/** The alarm turn: its words, the patterns' decision and reading, callRiskBeforeTurn. */
export interface AlarmTurn {
  call?: string;
  latest: string;
  earlier: readonly string[];
  companion?: string;
  patterns: string;
  detection: CrisisDetectionResult;
  priorRisk: boolean;
  env?: Env;
  now?: number;
}

function refusal(turn: AlarmTurn): string | null {
  if (!turn.call) return 'no_call';
  if (turn.patterns !== 'pass' || patternsFound(turn.detection)) return 'pattern';
  if (turn.priorRisk !== false) return 'prior_risk';
  // A caller who said they are under 18 keeps the script.
  if ([turn.latest, ...turn.earlier].some((line) => statesUnder18(line))) return 'minor';
  return null;
}

/** The alarm turn itself, read again as its words arrive (a preemptive, then the final request). */
const sameAlarm = (kept: Check, turn: AlarmTurn): boolean =>
  !kept.closed && kept.answering === undefined && kept.alarm === loose(turn.companion);

function remember(call: string, check: Omit<Check, 'answers' | 'closed'>): void {
  const oldest = checks.size >= MAX_CALLS ? checks.keys().next().value : undefined;
  if (oldest !== undefined) checks.delete(oldest);
  checks.set(call, { ...check, answers: new Map(), closed: false });
}

/**
 * Rule 1: the check in place of a classifier-only imminent script, or the
 * decision unchanged. Fails closed: any error keeps the script.
 */
export function checkInstead<D extends { action: string }>(stronger: D, turn: AlarmTurn): D {
  try {
    if (stronger.action !== 'replace' || !flagOn('CRISIS_CLASSIFIER_CHECK', turn.env)) {
      return stronger;
    }
    const script = stronger as D & Replace;
    const now = turn.now ?? Date.now();
    const window = new Set([turn.latest, ...turn.earlier.slice(-5)].map(loose).filter(Boolean));
    const kept = fresh(turn.call, now);
    const why = kept ? (sameAlarm(kept, turn) ? null : 'checked_before') : refusal(turn);
    if (why !== null || turn.call === undefined) {
      note('script', why ?? 'no_call');
      return stronger;
    }
    if (kept) for (const line of window) kept.window.add(line);
    else remember(turn.call, { at: now, alarm: loose(turn.companion), script, window });
    if (!kept) note('check', 'classifier_only');
    return { ...script, script: CLASSIFIER_CHECK };
  } catch (error) {
    log.warn({ error: error instanceof Error ? error.name : 'unknown' }, 'Check failed');
    return stronger;
  }
}

/**
 * The answer turn, as the gate handles it: `now` the script at once (nothing
 * read can clear it), `unread` the script when no live read will come,
 * `clears` rule 2 (every read below imminent and a clear answer).
 */
export interface CheckAnswer {
  now?: Replace;
  script: Replace;
  unread: <D extends { action: string }>(decision: D) => D | Replace;
  clears: (
    verdict: CrisisVerdict | null,
    reads?: () => Promise<ReadonlyArray<CrisisVerdict | null>>
  ) => Promise<boolean>;
}

/** This turn as the answer to the call's check, or null when it is not one. */
export function checkAnswer(
  call: string | undefined,
  said: { latest: string; companion?: string; ferni?: readonly string[] },
  detection: CrisisDetectionResult,
  now = Date.now()
): CheckAnswer | null {
  const kept = fresh(call, now);
  if (!call || !kept || kept.closed) return null;
  const line = loose(said.companion);
  if (kept.answering === undefined) {
    if (line === kept.alarm) return null; // the alarm turn, read again
    // The check was never spoken (decided on a preemptive request, then dropped): forget it.
    if (![...(said.ferni ?? []), said.companion ?? ''].some(began)) {
      checks.delete(call);
      return null;
    }
    kept.answering = line;
  }
  if (line !== kept.answering) {
    kept.closed = true; // a later turn: the check is over
    return null;
  }
  const { script } = kept;
  const decide = (cleared: boolean, why: string): boolean => {
    kept.answers.set(loose(said.latest), cleared);
    note(cleared ? 'cleared' : 'script', why);
    return cleared;
  };
  let why = now - kept.at > CHECK_ANSWER_MS ? 'late' : null;
  if (!asked(said.companion)) why = 'not_asked'; // Ferni said something else, or was cut off
  if (patternsFound(detection)) why = 'pattern';
  const shut = { now: script, script, unread: () => script, clears: async () => false };
  if (why) {
    decide(false, why);
    return shut;
  }
  return {
    script,
    unread: (decision) =>
      decision.action === 'replace' ? decision : (decide(false, 'unread'), script),
    async clears(verdict, reads) {
      try {
        const all = [verdict, ...(reads ? await reads() : [])];
        if (all.some((v) => !v)) return decide(false, 'missing_read');
        if (all.some((v) => v?.risk === 'imminent')) return decide(false, 'imminent');
        return clearAnswer(said.latest) ? decide(true, 'clear') : decide(false, 'unclear');
      } catch {
        return decide(false, 'error');
      }
    },
  };
}

/** Rule 3: Ferni's last line is the check, no caller words since (null: unknown), Ferni about
 * to speak: the script, or null. */
export function checkUnanswered(
  call: string | undefined,
  words: { latest: string; companion?: string } | null,
  now = Date.now()
): Replace | null {
  const kept = fresh(call, now);
  if (!kept || kept.closed) return null;
  const spoke = words ? words.latest.trim() !== '' || !asked(words.companion) : !!kept.answering;
  if (spoke) return null;
  kept.closed = true;
  note('script', words ? 'no_answer' : 'silence');
  return kept.script;
}

/** Rule 3: a check spoken here gets the script after CHECK_ANSWER_MS if the history shows no answer. */
export function watchCheck(
  session: object,
  call: string | undefined,
  gate: { decision: { action: string }; escalation: Promise<{ action: string } | null> | null },
  words: (history: never) => { latest: string; companion?: string },
  wait: (ms: number) => Promise<unknown> = async (ms) => sleep(ms, undefined, { ref: false })
): void {
  const arm = (decision: { action: string; script?: string } | null): void => {
    if (decision?.script !== CLASSIFIER_CHECK || !fresh(call)) return;
    wait(CHECK_ANSWER_MS)
      .then(() => {
        const live = session as { history?: { items?: unknown }; say?: (text: string) => unknown };
        const history = live.history?.items ? words(live.history as never) : null;
        const script = checkUnanswered(call, history);
        if (script) live.say?.(script.script);
      })
      .catch(() => log.warn({}, 'Check silence script not spoken'));
  };
  arm(gate.decision);
  gate.escalation?.then(arm).catch(() => undefined);
}

/** Rule 2: once the latest answer in the window cleared, the classifier's input without the
 * alarm's lines and that answer; otherwise the input as it was. */
export function reviewedWindow<T extends { earlier: readonly string[] }>(
  call: string | undefined,
  input: T
): T {
  const kept = fresh(call);
  if (!kept || kept.answers.size === 0) return input;
  const answer = [...input.earlier].reverse().find((l) => kept.answers.has(loose(l)));
  if (answer === undefined || !kept.answers.get(loose(answer))) return input;
  const dropped = (l: string): boolean => kept.window.has(loose(l)) || l === answer;
  const earlier = input.earlier.filter((l) => !dropped(l));
  return earlier.length === input.earlier.length ? input : { ...input, earlier };
}

/** For tests. */
export function resetClassifierChecks(): void {
  checks.clear();
}
