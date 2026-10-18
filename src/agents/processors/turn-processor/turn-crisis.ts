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
import {
  noteCrisisEscalation,
  noteCrisisRisk,
} from '../../../services/safety/crisis-escalations.js';
import { transferRequestIsEveryday } from '../../../services/safety/crisis-transfer-request.js';
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
   * Whether this turn gets a soft check-in instead (CRISIS_AGREEMENT_GATE):
   * its reads disagreed and no pattern matched. resolve() then returns the
   * patterns' reading.
   */
  softCheck(): Promise<boolean>;
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
  } = {}
): TurnCrisis {
  const patterns = detectCrisis(
    userText,
    toGuardVoiceEmotion(userData?.voiceEmotion as ProsodyEmotionLike | undefined),
    { recentMessages: userData?.recentTranscripts }
  );
  const shouldBlock = guardFromDetection(patterns).shouldBlock;
  const pattern = shouldBlock ? 'block' : patterns.isCrisis ? 'crisis' : 'none';
  if (pattern !== 'none') noteCrisisEscalation(options.sessionId); // real: a pattern match
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
  const classifier = startCrisisClassifier(input, { pattern, env, generate, scope, call });
  let settled: Promise<{ crisis: CrisisDetectionResult; soft: boolean }> | null = null;
  const settle = (): Promise<{ crisis: CrisisDetectionResult; soft: boolean }> =>
    (settled ??=
      classifier?.mode === 'live'
        ? classifier.verdict.then(async (verdict) => {
            const crisis = applyClassifierVerdict(patterns, verdict);
            // Real: the crisis script, whichever read called for it.
            const script = guardFromDetection(crisis).shouldBlock;
            if (script) noteCrisisEscalation(options.sessionId);
            if (transfer && crisis !== patterns && !script) {
              // A bare "pass me to Nayan": the soft check-in, never crisis guidance and never nothing.
              noteCrisisRisk(call);
              log.info({ outcome: 'soft', source: 'transfer-request' }, 'CRISIS_AGREEMENT');
              return { crisis: patterns, soft: true };
            }
            if (!scope || crisis === patterns) return { crisis, soft: false };
            if (!holdForReads) {
              shadowAdjudication(turnVerdicts(scope, input), transcriptFrom(input), {
                pattern,
                env,
                scope,
                source: 'pipeline',
                generate: options.adjudicate,
              });
              return { crisis, soft: false };
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
            // A classifier-only crisis gets a fuller second read (crisis-adjudicator.ts).
            const adjudicator = startCrisisAdjudicator(transcriptFrom(input), {
              pattern,
              verdicts,
              env,
              generate: options.adjudicate,
              source: 'pipeline',
              scope,
            });
            if (!(await adjudicatedCheckin(adjudicator))) {
              noteCrisisEscalation(options.sessionId); // real: the reads were weighed and it stood
              return { crisis, soft: false };
            }
            log.info({ outcome: 'soft', source: 'adjudicator' }, 'CRISIS_AGREEMENT');
            return { crisis: patterns, soft: true };
          })
        : Promise.resolve({ crisis: patterns, soft: false }));
  return {
    patterns,
    shouldBlock,
    resolve: () => settle().then((s) => s.crisis),
    softCheck: () => settle().then((s) => s.soft),
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
