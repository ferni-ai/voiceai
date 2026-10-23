/**
 * A crisis read that only the classifier agrees with gets an independent
 * second read before the 988 guidance (CRISIS_CLASSIFIER_ONLY_CHECKIN = off |
 * shadow | live, off by default).
 *
 * Prod canary, 2026-10-22 (8981d4f03, CRISIS_AGREEMENT_GATE on): Ferni asked
 * about a long week, the caller said "The running, not so much. Once,
 * maybe.", and the reply offered the 988 line. No pattern matched. Two
 * classifier reads of the turn both said crisis, so the agreement gate let
 * them stand, and the reply gate regenerated the reply with crisis guidance
 * (CRISIS_GATE action guide, source classifier). Dev the same day: the same
 * line, and "I'm just so tired. like bone tired." on another call.
 *
 * Those two reads were not independent: both are the same model, at
 * temperature 0, on the same caller words (the reply gate and the turn
 * pipeline, or a preemptive and a final request). Two copies of one read are
 * one read. At everyday prevalence a classifier on its own is right about
 * real risk only a few times in a hundred, so the 988 guidance needs
 * agreement from something that can disagree with it.
 *
 * Such a turn goes to the crisis adjudicator (crisis-adjudicator.ts: a
 * different model, a counselor's escalate-or-check-in rubric, the call's
 * recent lines by speaker), even with CRISIS_ADJUDICATOR off. One read per
 * turn, started by the reply gate from its fuller transcript and shared with
 * the turn pipeline, keyed by call and caller words; the pipeline never reads
 * on its own. Only its confident "checkin" with no caller risk quoted gives
 * the soft check (SOFT_CRISIS_CHECK). Escalate, low confidence, a timeout
 * (CRISIS_CLASSIFIER_ONLY_TIMEOUT_MS, 1200 ms by default), an error, too
 * little context, or no shared read keep the guidance.
 *
 * Live is held exactly as CRISIS_ADJUDICATOR=live is: until a replay lifts the
 * adjudicator's hold (crisis-adjudicator.ts adjudicatorCheckinsMayChangeReplies),
 * CRISIS_CLASSIFIER_ONLY_CHECKIN=live runs as shadow and logs liveHeld.
 *
 * A turn reaches the second read only when all of these hold:
 *   - the patterns found nothing at all in this turn (no indicator, no voice
 *     distress, no session escalation), and none in the caller's earlier lines;
 *   - the caller said at least three things before it this call, and the last
 *     five (what the classifier saw) hold nothing from the broad risk list or
 *     the escalate-only words: a call that opens with the read keeps the
 *     guidance (crisis-lone-imminent.ts makes the same call for goodbyes);
 *   - nothing on this call found risk before this turn (callRiskBeforeTurn:
 *     a pattern match, a classifier read that was not none or gave no verdict,
 *     a read in flight). An unknown call counts as risk;
 *   - every read of this turn, from both paths, arrived (with no call to
 *     gather them under, a read counts as missing), none was imminent, at
 *     least one was crisis, and every crisis read is about the caller;
 *   - the caller's own words hold nothing from the agreement gate's broad risk
 *     list (hasRiskContent) or the escalate-only words
 *     (crisis-classifier-only-text.ts), and do not agree with Ferni's line;
 *   - Ferni's line did not raise safety (a check-in, 988, 911);
 *   - the global adjudicator is not live (it has already read the turn).
 * Everything else keeps the crisis guidance exactly as before, as does any
 * error. A soft turn still counts as risk on the call, so the next crisis read
 * on the call is escalated as before: the check-in holds, and never drops.
 *
 * shadow never touches the reply: everything after the mode check, including
 * the wait for the other path's read, runs off the reply path, and the result
 * is logged (CRISIS_CLASSIFIER_ONLY).
 *
 * @module CrisisClassifierOnly
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  adjudicateCrisis,
  adjudicatorCheckinsMayChangeReplies,
  createGeminiAdjudicatorGenerate,
  transcriptFrom,
  type AdjudicatorLine,
  type AdjudicatorResult,
} from './crisis-adjudicator.js';
import { endorses, hasRiskContent } from './crisis-agreement.js';
import {
  resolveCrisisClassifierTimeoutMs,
  turnVerdicts,
  type CrisisClassifierInput,
  type CrisisGenerateFn,
  type CrisisVerdict,
} from './crisis-classifier.js';
import { hasEscalateOnlyWords } from './crisis-classifier-only-text.js';
import { detectCrisis, type CrisisDetectionResult } from './crisis-guard.js';
import { SAFETY_TALK } from './crisis-lone-imminent.js';

const log = createLogger({ module: 'CrisisClassifierOnly' });

type Env = Record<string, string | undefined>;
export type ClassifierOnlyMode = 'off' | 'shadow' | 'live';

/** The mode in effect: live only once the adjudicator's hold is lifted. */
export function resolveClassifierOnlyCheckin(env: Env = process.env): ClassifierOnlyMode {
  const raw = env.CRISIS_CLASSIFIER_ONLY_CHECKIN?.trim().toLowerCase();
  if (raw === 'live') return adjudicatorCheckinsMayChangeReplies() ? 'live' : 'shadow';
  return raw === 'shadow' ? raw : 'off';
}

export const DEFAULT_CLASSIFIER_ONLY_TIMEOUT_MS = 1200;

/** How long the second read may take before the turn escalates. */
export function resolveClassifierOnlyTimeoutMs(env: Env = process.env): number {
  const ms = Number(env.CRISIS_CLASSIFIER_ONLY_TIMEOUT_MS);
  return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_CLASSIFIER_ONLY_TIMEOUT_MS;
}

/**
 * Why a classifier crisis read keeps the guidance, or 'eligible' when only the
 * classifier agrees with itself and the turn goes to the independent read.
 */
export type ClassifierOnlyWhy =
  | 'eligible'
  | 'adjudicator_live'
  | 'pattern'
  | 'prior_risk'
  | 'missing_read'
  | 'imminent'
  | 'no_crisis_read'
  | 'third_party'
  | 'risk_words'
  | 'escalate_words'
  | 'endorses'
  | 'safety_talk'
  | 'earlier_pattern'
  | 'too_early'
  | 'error';

export interface ClassifierOnlyArgs {
  /** The patterns' reading of this turn, before the classifier. */
  detection: CrisisDetectionResult;
  /** Every classifier read of this turn, from either path. */
  verdicts: ReadonlyArray<CrisisVerdict | null>;
  latest: string;
  /** The caller's earlier words this call, oldest first. */
  earlier?: readonly string[];
  /** Ferni's line the caller's words answer. */
  companion?: string;
  /** callRiskBeforeTurn for this turn. */
  priorRisk: boolean;
  /** A live adjudicator is a second, fuller read; its escalation stands. */
  adjudicatorLive?: boolean;
}

/** NFKC, lower case, every apostrophe variant as '. */
const normalized = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** Earlier caller lines a call needs before a read can be eased. */
const MIN_EARLIER_LINES = 3;
/** The earlier lines the classifier sees (crisis-classifier.ts), checked for risk words. */
const RECENT_LINES = 5;

const patternsFound = (d: CrisisDetectionResult): boolean =>
  d.isCrisis || d.severity !== 0 || d.indicators.length > 0;

/** The checks that need no read: the patterns, the call, and the words. */
function wordsAndCall(args: ClassifierOnlyArgs): ClassifierOnlyWhy {
  const { detection, latest, companion, priorRisk } = args;
  if (args.adjudicatorLive) return 'adjudicator_live';
  if (patternsFound(detection)) return 'pattern';
  if (priorRisk !== false) return 'prior_risk';
  if (hasRiskContent(latest)) return 'risk_words';
  if (hasEscalateOnlyWords(latest)) return 'escalate_words';
  if (endorses(latest)) return 'endorses';
  if (companion !== undefined && typeof companion !== 'string') return 'safety_talk';
  if (companion !== undefined && SAFETY_TALK.test(normalized(companion))) return 'safety_talk';
  const given: readonly unknown[] = args.earlier ?? [];
  if (given.some((line) => typeof line !== 'string')) return 'earlier_pattern';
  const own = latest.trim();
  const earlier = (given as readonly string[])
    .map((line) => line.trim())
    .filter((line) => line !== '' && line !== own);
  if (earlier.some((line) => patternsFound(detectCrisis(line)))) return 'earlier_pattern';
  if (earlier.length < MIN_EARLIER_LINES) return 'too_early';
  const recent = earlier.slice(-RECENT_LINES);
  if (recent.some(hasRiskContent)) return 'risk_words';
  if (recent.some(hasEscalateOnlyWords)) return 'escalate_words';
  return 'eligible';
}

/** The first reason this turn keeps the guidance, or 'eligible'. Throws on bad input. */
function decide(args: ClassifierOnlyArgs): ClassifierOnlyWhy {
  const verdicts: ReadonlyArray<unknown> = Array.isArray(args.verdicts) ? args.verdicts : [];
  const reads = verdicts as ReadonlyArray<CrisisVerdict | null>;
  // A read that timed out or failed might have been the one that saw imminent risk.
  if (reads.length === 0 || reads.some((v) => !v || typeof v.risk !== 'string')) {
    return 'missing_read';
  }
  const all = reads as readonly CrisisVerdict[];
  if (all.some((v) => v.risk === 'imminent')) return 'imminent';
  const crisis = all.filter((v) => v.risk === 'crisis');
  if (crisis.length === 0) return 'no_crisis_read';
  if (crisis.some((v) => v.subject !== 'self')) return 'third_party';
  return wordsAndCall(args);
}

/** Why this turn keeps the guidance, or 'eligible'. Fails closed: an error keeps it. */
export function classifierOnlyWhy(args: ClassifierOnlyArgs): ClassifierOnlyWhy {
  try {
    return decide(args);
  } catch {
    return 'error';
  }
}

// ---------------------------------------------------------------------------
// One second read per turn, shared by the reply gate and the turn pipeline.
// ---------------------------------------------------------------------------

interface SecondRead {
  result: AdjudicatorResult;
  latencyMs: number;
}

/** Per call: each turn's caller words and its second read (null: the gate read none). */
interface TurnRead {
  at: number;
  turn: string;
  read: Promise<SecondRead | null> | null;
  waiters: Array<(read: Promise<SecondRead | null>) => void>;
}
const TTL_MS = 30_000;
const MAX_CALLS = 64;
const turnReads = new Map<string, TurnRead[]>();
let defaultAdjudicate: CrisisGenerateFn | null = null;

/** For tests: forget shared second reads. */
export function resetClassifierOnlyReads(): void {
  turnReads.clear();
}

const looseTurn = (latest: string): string =>
  latest
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** This call's entry for these caller words (one may hold a truncated line), created when asked. */
function entryFor(call: string, latest: string, create: boolean): TurnRead | null {
  const now = Date.now();
  for (const [k, list] of turnReads) {
    const fresh = list.filter((e) => now - e.at <= TTL_MS);
    if (fresh.length) turnReads.set(k, fresh);
    else turnReads.delete(k);
  }
  const turn = looseTurn(latest);
  if (!turn) return null;
  const list = turnReads.get(call) ?? [];
  const found = list.find((e) => e.turn === turn || e.turn.includes(turn) || turn.includes(e.turn));
  if (found || !create) return found ?? null;
  if (!turnReads.has(call) && turnReads.size >= MAX_CALLS) {
    const oldest = turnReads.keys().next().value;
    if (oldest !== undefined) turnReads.delete(oldest);
  }
  const entry: TurnRead = { at: now, turn, read: null, waiters: [] };
  turnReads.set(call, [...list, entry]);
  return entry;
}

function publish(entry: TurnRead, read: Promise<SecondRead | null>): Promise<SecondRead | null> {
  if (entry.read) return entry.read;
  entry.read = read;
  for (const wake of entry.waiters.splice(0)) wake(read);
  return read;
}

/** The reply gate starts the turn's one second read (or says there is none). Never rejects. */
function startSharedRead(
  call: string,
  latest: string,
  lines: readonly AdjudicatorLine[] | null,
  generate: CrisisGenerateFn | undefined,
  env: Env
): Promise<SecondRead | null> {
  const entry = entryFor(call, latest, true);
  if (!entry) return Promise.resolve(null);
  if (entry.read) return entry.read;
  if (!lines) return publish(entry, Promise.resolve(null));
  const startedAt = Date.now();
  const read = adjudicateCrisis(
    lines,
    generate ?? (defaultAdjudicate ??= createGeminiAdjudicatorGenerate()),
    resolveClassifierOnlyTimeoutMs(env)
  )
    .catch((): AdjudicatorResult => ({ decision: 'escalate', why: 'error' }))
    .then((result) => ({ result, latencyMs: Date.now() - startedAt }));
  return publish(entry, read);
}

/** The turn pipeline waits for the gate's read, at most `waitMs`; null when there is none. */
function awaitSharedRead(call: string, latest: string, waitMs: number): Promise<SecondRead | null> {
  const entry = entryFor(call, latest, true);
  if (!entry) return Promise.resolve(null);
  if (entry.read) return entry.read;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), waitMs);
    entry.waiters.push((read) => {
      clearTimeout(timer);
      read.then(resolve, () => resolve(null));
    });
  });
}

function logDecision(fields: Record<string, unknown>): void {
  try {
    log.info(fields, 'CRISIS_CLASSIFIER_ONLY');
  } catch {
    // Logging never changes the decision.
  }
}

export interface ClassifierOnlyOptions {
  detection: CrisisDetectionResult;
  /** This path's own read of the turn. */
  verdict: CrisisVerdict | null;
  input: CrisisClassifierInput;
  priorRisk: boolean;
  /** The turn's reads are kept under this scope (turnVerdicts); without one, a read counts as missing. */
  scope?: string;
  /** The call's session id: the shared second read is keyed by it. */
  call?: string;
  adjudicatorLive?: boolean;
  /** The call's recent lines by speaker (the reply gate's); transcriptFrom(input) when absent. */
  transcript?: readonly AdjudicatorLine[];
  /** The second read's model call (the adjudicator's). */
  adjudicate?: CrisisGenerateFn;
  env?: Env;
  source: 'gate' | 'pipeline';
}

const args = (o: ClassifierOnlyOptions): Omit<ClassifierOnlyArgs, 'verdicts'> => ({
  detection: o.detection,
  latest: o.input.latest,
  earlier: o.input.earlier,
  companion: o.input.companion,
  priorRisk: o.priorRisk,
  adjudicatorLive: o.adjudicatorLive,
});

/**
 * The reply gate, as soon as its own read is a crisis read: start the shared
 * second read early when nothing but the other path's read could still stop
 * it, so it overlaps the wait for that read. Live only; the final decision
 * still checks every read. Never throws.
 */
export function prestartClassifierOnly(options: ClassifierOnlyOptions): void {
  try {
    const env = options.env ?? process.env;
    if (resolveClassifierOnlyCheckin(env) !== 'live' || !options.call) return;
    const { verdict, input } = options;
    if (verdict?.risk !== 'crisis' || verdict.subject !== 'self') return;
    const why = classifierOnlyWhy({ ...args(options), verdicts: [verdict] });
    if (why !== 'eligible') return;
    void startSharedRead(
      options.call,
      input.latest,
      options.transcript ?? transcriptFrom(input),
      options.adjudicate,
      env
    );
  } catch {
    // An early start is only an optimisation.
  }
}

/** Every check and the second read, as one decision. Never rejects. */
async function decideTurn(
  options: ClassifierOnlyOptions,
  env: Env
): Promise<Record<string, unknown> & { checkin: boolean }> {
  const { scope, input, source } = options;
  const call = options.call ?? scope;
  // Fail closed: a failed lookup, or no call to gather reads under, counts as a missing read.
  const verdicts = scope ? await turnVerdicts(scope, input).catch(() => [null]) : [null];
  const why = classifierOnlyWhy({ ...args(options), verdicts });
  const base = { reads: scope ? verdicts.length : 0 };
  if (why !== 'eligible') {
    // The pipeline waiting on this turn hears at once that there is no read.
    if (source === 'gate' && call) void startSharedRead(call, input.latest, null, undefined, env);
    return { ...base, checkin: false, outcome: 'escalate', why };
  }
  if (!call) return { ...base, checkin: false, outcome: 'escalate', why: 'missing_read' };
  const read =
    source === 'gate'
      ? startSharedRead(
          call,
          input.latest,
          options.transcript ?? transcriptFrom(input),
          options.adjudicate,
          env
        )
      : awaitSharedRead(
          call,
          input.latest,
          resolveClassifierOnlyTimeoutMs(env) + resolveCrisisClassifierTimeoutMs(env)
        );
  const second = await read;
  if (!second) {
    return { ...base, checkin: false, outcome: 'escalate', why: 'no_shared_read' };
  }
  const checkin = second.result.decision === 'checkin';
  return {
    ...base,
    checkin,
    outcome: checkin ? 'checkin' : 'escalate',
    why: checkin ? 'second_read_checkin' : 'second_read_escalate',
    secondRead: second.result.why,
    secondReadMs: second.latencyMs,
  };
}

/**
 * For a turn whose classifier read is about to bring crisis guidance: true
 * when CRISIS_CLASSIFIER_ONLY_CHECKIN is live (and not held), only the
 * classifier agrees with itself, and the turn's shared second read says
 * "checkin", so the turn gets the soft check instead. Shadow returns
 * false at once and decides off the reply path. Logs one CRISIS_CLASSIFIER_ONLY
 * line in shadow and live; does nothing when off. Never throws.
 */
export async function classifierOnlyCheckin(options: ClassifierOnlyOptions): Promise<boolean> {
  const env = options.env ?? process.env;
  const mode = resolveClassifierOnlyCheckin(env);
  if (mode === 'off') return false;
  const liveHeld =
    mode === 'shadow' && env.CRISIS_CLASSIFIER_ONLY_CHECKIN?.trim().toLowerCase() === 'live';
  const decided = decideTurn(options, env)
    .catch(() => ({ reads: 0, checkin: false, outcome: 'escalate', why: 'error' }))
    .then(({ checkin, ...fields }) => {
      logDecision({ mode, source: options.source, ...(liveHeld ? { liveHeld } : {}), ...fields });
      return checkin;
    });
  // Shadow never holds the reply, not even for the other path's read.
  if (mode !== 'live') return false;
  return decided.catch(() => false);
}
