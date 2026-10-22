/**
 * A crisis read that nothing else agrees with gets the soft check-in, not the
 * 988 guidance (CRISIS_CLASSIFIER_ONLY_CHECKIN = off | shadow | live, off by
 * default).
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
 * pipeline, or a preemptive and a final request). At everyday prevalence a
 * classifier on its own is right about real risk only a few times in a
 * hundred, so a severe response needs agreement from something that can
 * disagree with it. Without that, the turn gets the soft check
 * (SOFT_CRISIS_CHECK): Ferni stays in the conversation, checks in once if the
 * caller seems to be struggling, and offers 988 if they say anything about
 * hurting themselves.
 *
 * Only when all of these hold:
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
 *   - Ferni's line did not raise safety (a check-in, 988, 911).
 * Everything else keeps the crisis guidance exactly as before, as does any
 * error. A soft turn still counts as risk on the call, so the next crisis read
 * on the call is escalated as before: the check-in holds, and never drops.
 *
 * shadow logs what live would decide (CRISIS_CLASSIFIER_ONLY) and changes
 * nothing.
 *
 * @module CrisisClassifierOnly
 */

import { createLogger } from '../../utils/safe-logger.js';
import { endorses, hasRiskContent } from './crisis-agreement.js';
import {
  turnVerdicts,
  type CrisisClassifierInput,
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

/** Why a classifier crisis read keeps the guidance, or 'checkin' when it gets the soft check. */
export type ClassifierOnlyWhy =
  | 'checkin'
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

/** The first reason this turn keeps the guidance, or 'checkin'. Throws on bad input. */
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
  return 'checkin';
}

/** Why this turn keeps the guidance, or 'checkin'. Fails closed: an error keeps it. */
export function classifierOnlyWhy(args: ClassifierOnlyArgs): ClassifierOnlyWhy {
  try {
    return decide(args);
  } catch {
    return 'error';
  }
}

/**
 * For a turn whose classifier read is about to bring crisis guidance: true
 * when CRISIS_CLASSIFIER_ONLY_CHECKIN is live and nothing agrees with the
 * read, so the turn gets the soft check instead. Logs one CRISIS_CLASSIFIER_ONLY
 * line in shadow and live; does nothing when off. Never throws.
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
  env?: Record<string, string | undefined>;
  source: 'gate' | 'pipeline';
}): Promise<boolean> {
  const mode = resolveClassifierOnlyCheckin(options.env);
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
  try {
    log.info(
      {
        mode,
        source: options.source,
        outcome: why === 'checkin' ? 'checkin' : 'escalate',
        why,
        reads,
      },
      'CRISIS_CLASSIFIER_ONLY'
    );
  } catch {
    // Logging never changes the decision.
  }
  return mode === 'live' && why === 'checkin';
}
