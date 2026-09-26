/**
 * Crisis Guard — shadow observer for the live voice path
 *
 * The crisis guard (crisis-guard.ts) can replace the model's reply with a 988
 * script. Before it is allowed to do that to real callers, it runs in SHADOW:
 * on every final user transcript it computes what it WOULD do and logs the
 * decision, without touching the reply.
 *
 * Modes (env CRISIS_GUARD_MODE):
 *   off     — no evaluation, zero cost
 *   shadow  — evaluate + log the would-be decision (DEFAULT)
 *
 * There is deliberately no "live" mode yet. Promotion to live is gated on the
 * shadow log: the would-block rate on real traffic must be reviewed for false
 * positives first. Any unrecognised value (including "live") resolves to shadow,
 * so a typo can never silently disable safety observation.
 *
 * Privacy: the record carries the decision and the transcript LENGTH, never the
 * transcript text. A caller in crisis must not end up quoted in log storage.
 */

import { guardPreResponse, type VoiceEmotionContext } from './crisis-guard.js';

export type CrisisGuardMode = 'off' | 'shadow';

export function resolveCrisisGuardMode(
  env: Record<string, string | undefined> = process.env
): CrisisGuardMode {
  const raw = env.CRISIS_GUARD_MODE?.trim().toLowerCase();
  return raw === 'off' ? 'off' : 'shadow';
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
  mode: CrisisGuardMode
): CrisisShadowRecord | null {
  if (mode === 'off') return null;
  const text = transcript.trim();
  if (!text) return null;

  const guard = guardPreResponse(text, voiceEmotion);
  return {
    mode,
    wouldBlock: guard.shouldBlock,
    isCrisis: guard.isCrisis,
    severity: guard.crisisSeverity,
    voiceAvailable: voiceEmotion !== undefined,
    transcriptChars: text.length,
  };
}
