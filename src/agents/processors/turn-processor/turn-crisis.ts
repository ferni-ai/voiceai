/**
 * Crisis state for one processed turn: the pattern guard's reading, available
 * at once, and the classifier's second stage started alongside it so it
 * overlaps the rest of the turn. In live mode resolve() awaits the (bounded)
 * verdict; in shadow mode the classifier only logs and resolve() returns the
 * pattern reading.
 *
 * @module TurnCrisis
 */

import { startCrisisClassifier } from '../../../services/safety/crisis-classifier.js';
import {
  applyClassifierVerdict,
  detectCrisis,
  guardFromDetection,
  type CrisisDetectionResult,
} from '../../safety/crisis-guard.js';
import { toGuardVoiceEmotion, type ProsodyEmotionLike } from '../../safety/crisis-shadow.js';
import type { CrisisDetection } from '../types.js';

export interface TurnCrisis {
  /** The pattern guard's reading of this turn. */
  patterns: CrisisDetectionResult;
  /** Whether the patterns alone replace the reply. */
  shouldBlock: boolean;
  /** The patterns with the live classifier verdict applied. Memoized. */
  resolve(): Promise<CrisisDetectionResult>;
}

export function startTurnCrisis(
  userText: string,
  userData:
    { voiceEmotion?: unknown; recentTranscripts?: string[]; lastAgentResponse?: string } | undefined
): TurnCrisis {
  const patterns = detectCrisis(
    userText,
    toGuardVoiceEmotion(userData?.voiceEmotion as ProsodyEmotionLike | undefined),
    { recentMessages: userData?.recentTranscripts }
  );
  const shouldBlock = guardFromDetection(patterns).shouldBlock;
  const classifier = startCrisisClassifier(
    {
      latest: userText,
      earlier: userData?.recentTranscripts ?? [],
      companion: userData?.lastAgentResponse,
    },
    { pattern: shouldBlock ? 'block' : patterns.isCrisis ? 'crisis' : 'none' }
  );
  let resolved: Promise<CrisisDetectionResult> | null = null;
  const resolve = (): Promise<CrisisDetectionResult> =>
    (resolved ??=
      classifier?.mode === 'live'
        ? classifier.verdict.then((verdict) => applyClassifierVerdict(patterns, verdict))
        : Promise.resolve(patterns));
  return { patterns, shouldBlock, resolve };
}

/** Crisis signal strong enough that the LLM must stay in the loop. */
export function hasCrisisSignal(crisis: CrisisDetectionResult): boolean {
  return crisis.isCrisis || crisis.severity > 0.3;
}

/** The turn result's crisis field. */
export function crisisSummary(crisis: CrisisDetectionResult): CrisisDetection {
  return {
    isCrisis: crisis.isCrisis,
    severity: crisis.severity,
    indicators: crisis.indicators,
    suggestedResponse: crisis.suggestedResponse,
    shouldOverrideLLM: guardFromDetection(crisis).shouldBlock,
    subject: crisis.subject,
    language: crisis.language,
  };
}
