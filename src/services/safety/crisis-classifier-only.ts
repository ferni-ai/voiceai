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
 * With the flag live, a turn whose only agreement is the classifier with
 * itself goes to an independent second read before the guidance: the crisis
 * adjudicator (crisis-adjudicator.ts: a different model, a counselor's
 * escalate-or-check-in rubric, the call's recent lines by speaker), even with
 * CRISIS_ADJUDICATOR off. Only its confident "checkin" with no caller risk
 * quoted gives the soft check (SOFT_CRISIS_CHECK); escalate, low confidence,
 * a timeout, an error or too little context keep the guidance.
 *
 * A turn reaches that read only when all of these hold:
 *   - the patterns found nothing at all in this turn (no indicator, no voice
 *     distress, no session escalation), and none in the caller's earlier lines;
 *   - the caller said at least three things before it this call, and the last
 *     five (what the classifier saw) hold nothing from the broad risk list: a
 *     call that opens with the read keeps the guidance (crisis-lone-imminent.ts
 *     makes the same call for goodbyes);
 *   - nothing on this call found risk before this turn (callRiskBeforeTurn:
 *     a pattern match, a classifier read that was not none or gave no verdict,
 *     a read in flight). An unknown call counts as risk;
 *   - every read of this turn arrived, none was imminent, at least one was
 *     crisis, and every crisis read is about the caller;
 *   - the caller's own words hold nothing from the agreement gate's broad risk
 *     list (hasRiskContent: means, plans, "tonight", goodbyes, other
 *     languages) and do not agree with Ferni's line;
 *   - Ferni's line did not raise safety (a check-in, 988, 911);
 *   - the global adjudicator is not live (it has already read the turn).
 * Everything else keeps the crisis guidance exactly as before, as does any
 * error. A soft turn still counts as risk on the call, so the next crisis read
 * on the call is escalated as before: the check-in holds, and never drops.
 *
 * shadow runs the second read off the reply path and logs what live would
 * decide (CRISIS_CLASSIFIER_ONLY); the reply is unchanged.
 *
 * @module CrisisClassifierOnly
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  adjudicateCrisis,
  createGeminiAdjudicatorGenerate,
  normalizeTranscript,
  resolveCrisisAdjudicatorTimeoutMs,
  transcriptFrom,
  type AdjudicatorLine,
  type AdjudicatorResult,
} from './crisis-adjudicator.js';
import { endorses, hasRiskContent } from './crisis-agreement.js';
import {
  turnVerdicts,
  type CrisisClassifierInput,
  type CrisisGenerateFn,
  type CrisisVerdict,
} from './crisis-classifier.js';
import { detectCrisis, type CrisisDetectionResult } from './crisis-guard.js';
import { SAFETY_TALK } from './crisis-lone-imminent.js';

const log = createLogger({ module: 'CrisisClassifierOnly' });

export type ClassifierOnlyMode = 'off' | 'shadow' | 'live';

export function resolveClassifierOnlyCheckin(
  env: Record<string, string | undefined> = process.env
): ClassifierOnlyMode {
  const raw = env.CRISIS_CLASSIFIER_ONLY_CHECKIN?.trim().toLowerCase();
  return raw === 'live' || raw === 'shadow' ? raw : 'off';
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

/** The first reason this turn keeps the guidance, or 'eligible'. Throws on bad input. */
function decide(args: ClassifierOnlyArgs): ClassifierOnlyWhy {
  const { detection, latest, companion, priorRisk } = args;
  if (args.adjudicatorLive) return 'adjudicator_live';
  if (patternsFound(detection)) return 'pattern';
  if (priorRisk !== false) return 'prior_risk';
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
  if (hasRiskContent(latest)) return 'risk_words';
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
  if (earlier.slice(-RECENT_LINES).some(hasRiskContent)) return 'risk_words';
  return 'eligible';
}

/** Why this turn keeps the guidance, or 'eligible'. Fails closed: an error keeps it. */
export function classifierOnlyWhy(args: ClassifierOnlyArgs): ClassifierOnlyWhy {
  try {
    return decide(args);
  } catch {
    return 'error';
  }
}

let defaultAdjudicate: CrisisGenerateFn | null = null;

/** One turn's duplicate requests (preemptive and final) share one second read. In memory. */
const RECENT_TTL_MS = 30_000;
const RECENT_MAX = 32;
const recentReads = new Map<string, { at: number; read: Promise<SecondRead> }>();

interface SecondRead {
  result: AdjudicatorResult;
  latencyMs: number;
}

/** For tests: forget shared second reads. */
export function resetClassifierOnlyReads(): void {
  recentReads.clear();
}

/** The independent read of this turn. Never rejects: any failure escalates. */
function secondRead(
  lines: readonly AdjudicatorLine[],
  scope: string | undefined,
  generate: CrisisGenerateFn | undefined,
  env: Record<string, string | undefined>
): Promise<SecondRead> {
  const now = Date.now();
  const key = JSON.stringify([scope ?? '', normalizeTranscript(lines)]);
  for (const [k, v] of recentReads) if (now - v.at > RECENT_TTL_MS) recentReads.delete(k);
  const shared = recentReads.get(key)?.read;
  if (shared) return shared;
  const read = adjudicateCrisis(
    lines,
    generate ?? (defaultAdjudicate ??= createGeminiAdjudicatorGenerate()),
    resolveCrisisAdjudicatorTimeoutMs(env)
  )
    .catch((): AdjudicatorResult => ({ decision: 'escalate', why: 'error' }))
    .then((result) => ({ result, latencyMs: Date.now() - now }));
  if (recentReads.size >= RECENT_MAX) {
    const oldest = recentReads.keys().next().value;
    if (oldest !== undefined) recentReads.delete(oldest);
  }
  recentReads.set(key, { at: now, read });
  return read;
}

function logDecision(fields: Record<string, unknown>): void {
  try {
    log.info(fields, 'CRISIS_CLASSIFIER_ONLY');
  } catch {
    // Logging never changes the decision.
  }
}

/**
 * For a turn whose classifier read is about to bring crisis guidance: true
 * when CRISIS_CLASSIFIER_ONLY_CHECKIN is live, only the classifier agrees with
 * itself, and the independent second read says "checkin", so the turn gets the
 * soft check instead. Logs one CRISIS_CLASSIFIER_ONLY line in shadow and live
 * (shadow after its off-path second read); does nothing when off. Never throws.
 */
export async function classifierOnlyCheckin(options: {
  detection: CrisisDetectionResult;
  /** This path's own read of the turn. */
  verdict: CrisisVerdict | null;
  input: CrisisClassifierInput;
  priorRisk: boolean;
  /** The turn's reads are kept under this scope (turnVerdicts); without it only this read counts. */
  scope?: string;
  adjudicatorLive?: boolean;
  /** The call's recent lines by speaker; transcriptFrom(input) when absent. */
  transcript?: readonly AdjudicatorLine[];
  /** The second read's model call (the adjudicator's). */
  adjudicate?: CrisisGenerateFn;
  env?: Record<string, string | undefined>;
  source: 'gate' | 'pipeline';
}): Promise<boolean> {
  const env = options.env ?? process.env;
  const mode = resolveClassifierOnlyCheckin(env);
  if (mode === 'off') return false;
  let why: ClassifierOnlyWhy = 'error';
  let reads = 0;
  try {
    const { scope, input } = options;
    // Fail closed: a failed lookup counts as a missing read.
    const verdicts = scope
      ? await turnVerdicts(scope, input).catch(() => [null])
      : [options.verdict];
    reads = verdicts.length;
    why = classifierOnlyWhy({
      detection: options.detection,
      verdicts,
      latest: input.latest,
      earlier: input.earlier,
      companion: input.companion,
      priorRisk: options.priorRisk,
      adjudicatorLive: options.adjudicatorLive,
    });
  } catch {
    why = 'error';
  }
  const base = { mode, source: options.source, reads };
  if (why !== 'eligible') {
    logDecision({ ...base, outcome: 'escalate', why });
    return false;
  }
  let read: Promise<SecondRead>;
  try {
    read = secondRead(
      options.transcript ?? transcriptFrom(options.input),
      options.scope,
      options.adjudicate,
      env
    );
  } catch {
    logDecision({ ...base, outcome: 'escalate', why: 'error' });
    return false;
  }
  const decided = read.then(({ result, latencyMs }) => {
    const checkin = result.decision === 'checkin';
    logDecision({
      ...base,
      outcome: checkin ? 'checkin' : 'escalate',
      why: checkin ? 'second_read_checkin' : 'second_read_escalate',
      secondRead: result.why,
      secondReadMs: latencyMs,
    });
    return checkin;
  });
  // Shadow never holds the reply for the second read.
  if (mode !== 'live') return false;
  return decided.catch(() => false);
}
