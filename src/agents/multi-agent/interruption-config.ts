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
 * BARGE_IN_GUARD=on (off by default) stops Ferni pausing for a "mm-hmm":
 * - Voice activity pauses him after 500 ms of caller speech instead of 150 ms.
 *   This gate applies where the model doesn't decide: while a reply is
 *   starting and in VAD mode. Human backchannels run 290 ms median (AMI
 *   meetings, n=2072): 94.5% reach 150 ms, 19% reach 500 ms, while 92% of
 *   other utterances still do.
 * - After a pause that brought no words, Ferni resumes 1 s after the caller
 *   stops instead of 2 s (LiveKit's default). Words that do follow arrive in
 *   time: ink's final transcript came within 1350 ms (the voice detector's
 *   350 ms hangover plus 1 s) for 98% of dev turns (n=1553, 2026-10-04..11).
 * On dev, 4.7% of replies were paused for a caller who said nothing
 * (BARGE_IN_FALSE_INTERRUPTION, 73 in 7 days; scripts/voice-eval/turn-taking.mjs).
 * With NEVER_SILENT=on a reply paused for noise resumes 1 s after the noise
 * ends instead of LiveKit's 2 s (resume-buffer.ts brings back its lost audio).
 *
 * @module agents/multi-agent/interruption-config
 */

export interface InterruptionOverrides {
  mode: 'adaptive' | 'vad';
  minWords?: number;
  /** Caller speech (ms) before voice activity pauses Ferni. */
  minDuration?: number;
  /** How long a pause with no words lasts before Ferni resumes (ms). */
  falseInterruptionTimeout?: number;
}

export const GUARD_MIN_SPEECH_MS = 500;
export const GUARD_RESUME_AFTER_MS = 1000;

export function bargeInGuardOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.BARGE_IN_GUARD === 'on';
}

export function interruptionOverrides(
  env: Record<string, string | undefined> = process.env
): InterruptionOverrides {
  const resume = env.NEVER_SILENT?.trim().toLowerCase() === 'on' && {
    falseInterruptionTimeout: 1000,
  };
  const base: InterruptionOverrides =
    env.INTERRUPTION_MODE === 'vad'
      ? { mode: 'vad', ...resume }
      : { mode: 'adaptive', minWords: 0, ...resume };
  if (!bargeInGuardOn(env)) return base;
  return {
    ...base,
    minDuration: GUARD_MIN_SPEECH_MS,
    falseInterruptionTimeout: GUARD_RESUME_AFTER_MS,
  };
}

/** The parts of LiveKit's live AgentActivity (session._activity) that say how barge-in works. */
interface ActivityInterruptionView {
  _activity?: {
    interruptionDetector?: unknown;
    isInterruptionByAudioActivityEnabled?: boolean;
    pausedSpeech?: unknown;
  };
}

const activityOf = (session: unknown) =>
  (session as ActivityInterruptionView | undefined)?._activity;

/**
 * The barge-in mode LiveKit resolved for this session (it drops 'adaptive'
 * when the STT or VAD can't support it): 'adaptive', 'vad', 'none', or
 * 'unknown' with no activity running.
 */
export function interruptionModeInUse(session: unknown): string {
  const activity = activityOf(session);
  if (!activity) return 'unknown';
  if (activity.interruptionDetector) return 'adaptive';
  return activity.isInterruptionByAudioActivityEnabled === false ? 'none' : 'vad';
}

/** Ferni's reply is paused for the caller's voice (LiveKit's interruptByAudioActivity). */
export function speechPausedForCaller(session: unknown): boolean {
  return Boolean(activityOf(session)?.pausedSpeech);
}
