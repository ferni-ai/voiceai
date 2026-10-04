/**
 * How the caller interrupts Ferni.
 *
 * Measured on dev (scripts/voice-eval talk-over scenario, 2026-09-29) with
 * VAD barge-in gated on one transcribed word: Ferni kept talking 2.6 s over a
 * caller who said "Wait, hold on", and a caller's "mm-hmm" still cut it off,
 * just as late. Both wait for Ink-2's first word.
 *
 * Adaptive mode uses LiveKit's audio model to tell a real interruption from a
 * backchannel, a cough or noise within a few hundred ms, and resumes after a
 * false one (free on LiveKit Cloud). It needs the STT to report transcript
 * times, which the patched Cartesia plugin now does ('chunk' alignment), and
 * minWords 0: the word gate applies in adaptive mode too and would bring the
 * 2.6 s back. INTERRUPTION_MODE=vad keeps the old behavior.
 *
 * @module agents/multi-agent/interruption-config
 */

export interface InterruptionOverrides {
  mode: 'adaptive' | 'vad';
  minWords?: number;
}

export function interruptionOverrides(
  env: Record<string, string | undefined> = process.env
): InterruptionOverrides {
  if (env.INTERRUPTION_MODE === 'vad') return { mode: 'vad' };
  return { mode: 'adaptive', minWords: 0 };
}
