/**
 * Crisis state for one processed turn: the pattern guard's reading, available
 * at once, and the classifier's second stage started alongside it so it
 * overlaps the rest of the turn. In live mode resolve() awaits the (bounded)
 * verdict; in shadow mode the classifier only logs and resolve() returns the
 * pattern reading.
 *
 * @module TurnCrisis
 */

import {
  agreementOutcome,
  resolveCrisisAgreementGate,
} from '../../../services/safety/crisis-agreement.js';
import {
  adjudicatedCheckin,
  resolveCrisisAdjudicatorMode,
  shadowAdjudication,
  startCrisisAdjudicator,
  transcriptFrom,
} from '../../../services/safety/crisis-adjudicator.js';
import {
  startCrisisClassifier,
  turnVerdicts,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { noteCrisisRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  groundedPriorRisk,
  groundedRelease,
} from '../../../services/safety/crisis-grounded-release.js';
import { transferRequestIsEveryday } from '../../../services/safety/crisis-transfer-request.js';
import {
  classifierOnlyCheckin,
  resolveClassifierOnlyCheckin,
} from '../../../services/safety/crisis-classifier-only.js';
import {
  callRiskBeforeTurn,
  loneImminentGoodbye,
} from '../../../services/safety/crisis-lone-imminent.js';
import {
  applyClassifierVerdict,
  detectCrisis,
  guardFromDetection,
  type CrisisDetectionResult,
} from '../../safety/crisis-guard.js';
import { toGuardVoiceEmotion, type ProsodyEmotionLike } from '../../safety/crisis-shadow.js';
import type { CrisisDetection } from '../types.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'TurnCrisis' });

export interface TurnCrisis {
  /** The pattern guard's reading of this turn. */
  patterns: CrisisDetectionResult;
  /** Whether the patterns alone replace the reply. */
  shouldBlock: boolean;
  /** The patterns with the live classifier verdict applied. Memoized. */
  resolve(): Promise<CrisisDetectionResult>;
  /**
   * Whether this turn gets a soft check-in instead: its reads disagreed and no
   * pattern matched (CRISIS_AGREEMENT_GATE), or a lone imminent read of a plain
   * goodbye on a call with no risk (crisis-lone-imminent.ts). resolve() then
   * returns the patterns' reading.
   */
  softCheck(): Promise<boolean>;
  /**
   * Whether a router may answer this turn without the reply model (FTIS direct
   * execution, the semantic short-circuit): never with a crisis signal or a
   * soft check-in, which only the normal reply path carries.
   */
  bypassAllowed(): Promise<boolean>;
}

export function startTurnCrisis(
  userText: string,
  userData:
    | { voiceEmotion?: unknown; recentTranscripts?: string[]; lastAgentResponse?: string }
    | undefined,
  options: {
    sessionId?: string;
    env?: Record<string, string | undefined>;
    generate?: CrisisGenerateFn;
    /** The adjudicator's model call. */
    adjudicate?: CrisisGenerateFn;
    /** The grounded release's model calls (crisis-grounded-release.ts). */
    groundedReads?: readonly CrisisGenerateFn[];
  } = {}
): TurnCrisis {
  const patterns = detectCrisis(
    userText,
    toGuardVoiceEmotion(userData?.voiceEmotion as ProsodyEmotionLike | undefined),
    { recentMessages: userData?.recentTranscripts }
  );
  const shouldBlock = guardFromDetection(patterns).shouldBlock;
  const pattern = shouldBlock ? 'block' : patterns.isCrisis ? 'crisis' : 'none';
  if (pattern !== 'none') noteCrisisRisk(options.sessionId); // risk on this call (crisis-call-risk.ts)
  const { env = process.env, generate } = options;
  // Only the agreement gate and a live adjudicator hold the turn for the turn's
  // other reads; a shadow adjudicator runs beside it and never delays it.
  const agreementGate = resolveCrisisAgreementGate(env);
  const adjudicatorMode = resolveCrisisAdjudicatorMode(env);
  const scope =
    agreementGate || adjudicatorMode !== 'off' ? options.sessionId || undefined : undefined;
  const holdForReads = agreementGate || adjudicatorMode === 'live';
  const input = {
    latest: userText,
    earlier: userData?.recentTranscripts ?? [],
    companion: userData?.lastAgentResponse,
  };
  const call = options.sessionId || undefined;
  // CRISIS_TRANSFER_EVERYDAY: decided before this turn's own read starts (crisis-transfer-request.ts).
  const transfer =
    adjudicatorMode !== 'live' && transferRequestIsEveryday(input, pattern, call, env);
  // Taken before this turn's own read starts (crisis-lone-imminent.ts).
  const priorRisk = callRiskBeforeTurn(call, input);
  const groundedPrior = groundedPriorRisk(call, userText);
  const classifier = startCrisisClassifier(input, { pattern, env, generate, scope, call });
  let settled: Promise<{ crisis: CrisisDetectionResult; soft: boolean }> | null = null;
  const settle = (): Promise<{ crisis: CrisisDetectionResult; soft: boolean }> =>
    (settled ??=
      classifier?.mode === 'live'
        ? classifier.verdict.then(async (verdict) => {
            // A lone imminent read of a plain goodbye on a call with no risk: the soft check.
            if (loneImminentGoodbye({ detection: patterns, verdict, ...input, priorRisk })) {
              log.info({ outcome: 'soft', source: 'lone_imminent_goodbye' }, 'CRISIS_AGREEMENT');
              return { crisis: patterns, soft: true };
            }
            // CRISIS_GROUNDED_RELEASE: an imminent read the call plainly explains (shared run).
            const released = await groundedRelease({
              detection: patterns,
              verdict,
              input,
              priorRisk: groundedPrior,
              call,
              env,
              source: 'pipeline',
              generates: options.groundedReads,
            });
            if (released) {
              log.info({ outcome: 'soft', source: 'grounded_release' }, 'CRISIS_AGREEMENT');
              return { crisis: patterns, soft: true };
            }
            const crisis = applyClassifierVerdict(patterns, verdict);
            if (crisis !== patterns) noteCrisisRisk(call); // CRISIS_TRANSFER_EVERYDAY
            // A bare "pass me to Nayan" (CRISIS_TRANSFER_EVERYDAY): a crisis read, never an
            // imminent one whoever it is about, gets the soft check-in after every other check.
            let softTransfer =
              transfer &&
              crisis !== patterns &&
              verdict?.risk === 'crisis' &&
              !guardFromDetection(crisis).shouldBlock;
            const eased = (): { crisis: CrisisDetectionResult; soft: boolean } => {
              log.info({ outcome: 'soft', source: 'transfer-request' }, 'CRISIS_AGREEMENT');
              return { crisis: patterns, soft: true };
            };
            // CRISIS_CLASSIFIER_ONLY_CHECKIN: a crisis read nothing else agrees with (crisis-classifier-only.ts).
            const escalated = async (): Promise<{
              crisis: CrisisDetectionResult;
              soft: boolean;
            }> => {
              if (softTransfer) return eased();
              const only =
                crisis !== patterns &&
                !guardFromDetection(crisis).shouldBlock &&
                resolveClassifierOnlyCheckin(env) !== 'off' &&
                (await classifierOnlyCheckin({
                  detection: patterns,
                  verdict,
                  input,
                  priorRisk,
                  scope,
                  env,
                  adjudicatorLive: adjudicatorMode === 'live',
                  source: 'pipeline',
                }));
              if (!only) return { crisis, soft: false };
              log.info({ outcome: 'soft', source: 'classifier_only' }, 'CRISIS_AGREEMENT');
              return { crisis: patterns, soft: true };
            };
            if (!scope || crisis === patterns) return escalated();
            if (!holdForReads) {
              shadowAdjudication(turnVerdicts(scope, input), transcriptFrom(input), {
                pattern,
                env,
                scope,
                source: 'pipeline',
                generate: options.adjudicate,
              });
              return escalated();
            }
            // Fail closed: a failed lookup counts as a missing read, which escalates.
            const verdicts = await turnVerdicts(scope, input).catch(() => [null]);
            const outcome = agreementGate
              ? agreementOutcome({ pattern, verdicts, ...input })
              : 'escalate';
            if (outcome !== 'escalate') {
              log.info({ outcome, reads: verdicts.length }, 'CRISIS_AGREEMENT');
              return { crisis: patterns, soft: outcome === 'soft' };
            }
            // Reads of this turn that agree on risk are never eased.
            if (
              verdicts.filter((v) => v?.risk === 'crisis' || v?.risk === 'imminent').length >= 2
            ) {
              softTransfer = false;
            }
            // A classifier-only crisis gets a fuller second read (crisis-adjudicator.ts).
            const adjudicator = startCrisisAdjudicator(transcriptFrom(input), {
              pattern,
              verdicts,
              env,
              generate: options.adjudicate,
              source: 'pipeline',
              scope,
            });
            if (!(await adjudicatedCheckin(adjudicator))) return escalated();
            log.info({ outcome: 'soft', source: 'adjudicator' }, 'CRISIS_AGREEMENT');
            return { crisis: patterns, soft: true };
          })
        : Promise.resolve({ crisis: patterns, soft: false }));
  return {
    patterns,
    shouldBlock,
    resolve: () => settle().then((s) => s.crisis),
    softCheck: () => settle().then((s) => s.soft),
    bypassAllowed: () => settle().then((s) => !s.soft && !hasCrisisSignal(s.crisis)),
  };
}

/** Crisis signal strong enough that the LLM must stay in the loop. */
export function hasCrisisSignal(crisis: CrisisDetectionResult): boolean {
  return crisis.isCrisis || crisis.severity > 0.3;
}

/** The turn result's crisis field. */
export function crisisSummary(crisis: CrisisDetectionResult, softCheck = false): CrisisDetection {
  return {
    ...(softCheck ? { softCheck } : {}),
    isCrisis: crisis.isCrisis,
    severity: crisis.severity,
    indicators: crisis.indicators,
    suggestedResponse: crisis.suggestedResponse,
    shouldOverrideLLM: guardFromDetection(crisis).shouldBlock,
    subject: crisis.subject,
    language: crisis.language,
  };
}
