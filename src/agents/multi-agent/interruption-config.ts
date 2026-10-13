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
 * With NEVER_SILENT=on a reply paused for noise resumes 1 s after the noise
 * ends instead of LiveKit's 2 s (resume-buffer.ts brings back its lost audio).
 *
 * @module agents/multi-agent/interruption-config
 */

export interface InterruptionOverrides {
  mode: 'adaptive' | 'vad';
  minWords?: number;
  falseInterruptionTimeout?: number;
}

export function interruptionOverrides(
  env: Record<string, string | undefined> = process.env
): InterruptionOverrides {
  const resume = env.NEVER_SILENT?.trim().toLowerCase() === 'on' && {
    falseInterruptionTimeout: 1000,
  };
  if (env.INTERRUPTION_MODE === 'vad') return { mode: 'vad', ...resume };
  return { mode: 'adaptive', minWords: 0, ...resume };
}
