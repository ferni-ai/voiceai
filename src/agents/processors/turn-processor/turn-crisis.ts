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
import { relaySoftCheck } from '../../../services/safety/crisis-relay.js';
import {
  startCrisisClassifier,
  turnVerdicts,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
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
  } = {}
): TurnCrisis {
  const patterns = detectCrisis(
    userText,
    toGuardVoiceEmotion(userData?.voiceEmotion as ProsodyEmotionLike | undefined),
    { recentMessages: userData?.recentTranscripts }
  );
  const shouldBlock = guardFromDetection(patterns).shouldBlock;
  const pattern = shouldBlock ? 'block' : patterns.isCrisis ? 'crisis' : 'none';
  const { env = process.env, generate } = options;
  const scope = resolveCrisisAgreementGate(env) ? options.sessionId || undefined : undefined;
  const input = {
    latest: userText,
    earlier: userData?.recentTranscripts ?? [],
    companion: userData?.lastAgentResponse,
  };
  const classifier = startCrisisClassifier(input, { pattern, env, generate, scope });
  let settled: Promise<{ crisis: CrisisDetectionResult; soft: boolean }> | null = null;
  const settle = (): Promise<{ crisis: CrisisDetectionResult; soft: boolean }> =>
    (settled ??=
      classifier?.mode === 'live'
        ? classifier.verdict.then(async (verdict) => {
            const crisis = applyClassifierVerdict(patterns, verdict);
            // A bare request to reach someone, with no risk anywhere (crisis-relay.ts).
            if (
              crisis !== patterns &&
              relaySoftCheck({ pattern, verdicts: [verdict], ...input, env })
            ) {
              log.info({ outcome: 'relay_soft' }, 'CRISIS_AGREEMENT');
              return { crisis: patterns, soft: true };
            }
            if (!scope || crisis === patterns) return { crisis, soft: false };
            // Fail closed: a failed lookup counts as a missing read, which escalates.
            const verdicts = await turnVerdicts(scope, input).catch(() => [null]);
            const outcome = agreementOutcome({ pattern, verdicts, ...input });
            if (outcome === 'escalate') return { crisis, soft: false };
            log.info({ outcome, reads: verdicts.length }, 'CRISIS_AGREEMENT');
            return { crisis: patterns, soft: outcome === 'soft' };
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
