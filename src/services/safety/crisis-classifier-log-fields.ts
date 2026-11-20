/**
 * What one classifier read was given, for its CRISIS_CLASSIFIER log line, so prod can tell
 * false-alarm causes apart: which path read, whether the companion's line was context and
 * whether it was the app's own crisis line, and whether risk words were in the caller's latest
 * line or only in the companion's.
 *
 * Privacy: an enum, booleans and a count. Never caller, companion or model text.
 *
 * @module services/safety/crisis-classifier-log-fields
 */

import { riskWordsIn } from './crisis-agreement.js';
import { names911, names988 } from './crisis-line-speech.js';
import type { SecondReadPath } from './crisis-second-read-turn.js';

export interface ClassifierLogFields {
  /** The path that asked: the reply gate or the turn pipeline; null when none was given. */
  source: SecondReadPath | null;
  hasCompanion: boolean;
  /** Earlier caller lines the model saw. */
  earlierCount: number;
  latestRiskWords: boolean;
  companionRiskWords: boolean;
  /** The companion's line names 988 or 911, as the crisis scripts do. */
  companionIsScript: boolean;
}

/** From the input as the model sees it (normalizeInput in crisis-classifier.ts). */
export function classifierLogFields(
  read: { latest: string; earlier: readonly string[]; companion?: string },
  source: SecondReadPath | undefined
): ClassifierLogFields {
  const companion = read.companion ?? '';
  const has = companion !== '';
  return {
    source: source ?? null,
    hasCompanion: has,
    earlierCount: read.earlier.length,
    latestRiskWords: riskWordsIn(read.latest),
    companionRiskWords: has && riskWordsIn(companion),
    companionIsScript: has && (names988(companion) || names911(companion)),
  };
}
