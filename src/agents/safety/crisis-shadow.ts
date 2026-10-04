/**
 * Crisis Guard — per-turn observation record for the live voice path
 *
 * On every final user transcript this computes the guard's decision and logs
 * it. In live mode the reply itself is gated in the persona agent's llmNode
 * (personas/crisis-gate.ts); this record is the audit trail either way.
 *
 * Modes (env CRISIS_GUARD_MODE):
 *   off     — no evaluation, zero cost
 *   shadow  — evaluate + log; the reply is untouched
 *   live    — evaluate + log, and the reply is gated (DEFAULT)
 *
 * Any unrecognised value resolves to live, so a typo can never silently
 * disable the guard.
 *
 * Privacy: the record carries the decision and the transcript LENGTH, never the
 * transcript text. A caller in crisis must not end up quoted in log storage.
 */

import {
  guardPreResponse,
  type CrisisDetectionOptions,
  type VoiceEmotionContext,
} from './crisis-guard.js';

export type CrisisGuardMode = 'off' | 'shadow' | 'live';

export function resolveCrisisGuardMode(
  env: Record<string, string | undefined> = process.env
): CrisisGuardMode {
  const raw = env.CRISIS_GUARD_MODE?.trim().toLowerCase();
  return raw === 'off' || raw === 'shadow' ? raw : 'live';
}

/** The subset of the prosody analyzer's result the guard can use. */
export interface ProsodyEmotionLike {
  primary?: string;
  confidence?: number;
  stressLevel?: number;
}

/**
 * Map a prosody result onto the guard's voice context. The prosody analyzer has
 * no intensity field; vocal stress is the closest measured proxy.
 */
export function toGuardVoiceEmotion(
  prosody: ProsodyEmotionLike | null | undefined
): VoiceEmotionContext | undefined {
  if (!prosody?.primary) return undefined;
  return {
    primary: prosody.primary,
    confidence: prosody.confidence,
    intensity: prosody.stressLevel ?? 0,
  };
}

export interface CrisisShadowRecord {
  mode: CrisisGuardMode;
  /** The guard would have replaced the model's reply with the 988 script. */
  wouldBlock: boolean;
  isCrisis: boolean;
  severity: number;
  /** Voice context was present, so voice escalation could contribute. */
  voiceAvailable: boolean;
  transcriptChars: number;
}

/**
 * Evaluate one final user transcript. Returns null when there is nothing to
 * record: mode off, or an empty transcript.
 */
export function observeCrisisTurn(
  transcript: string,
  voiceEmotion: VoiceEmotionContext | undefined,
  mode: CrisisGuardMode,
  options?: CrisisDetectionOptions
): CrisisShadowRecord | null {
  if (mode === 'off') return null;
  const text = transcript.trim();
  if (!text) return null;

  const guard = guardPreResponse(text, voiceEmotion, options);
  return {
    mode,
    wouldBlock: guard.shouldBlock,
    isCrisis: guard.isCrisis,
    severity: guard.crisisSeverity,
    voiceAvailable: voiceEmotion !== undefined,
    transcriptChars: text.length,
  };
}
