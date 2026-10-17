/**
 * The port for side effects of voicing a reply: a reply tone sent to the
 * client, a sound recorded, carry-over for the next reply, a flag cleared, a
 * checkpoint timed. They run at once unless a gate is installed.
 *
 * The gate lives with LiveKit (speech/tts-gateway/preemptive-reply-gate.ts,
 * PREEMPTIVE_TTS): a preemptive reply's side effects wait until LiveKit
 * schedules it, and a dropped one makes none. Speech and expression code
 * depends on this port, not on the LiveKit adapter.
 *
 * @module utils/reply-side-effects
 */

/** Runs `effect` now, later, or never, as the reply it belongs to plays. */
export type ReplySideEffectGate = (
  effect: () => void,
  env?: Readonly<Record<string, string | undefined>>
) => void;

const now: ReplySideEffectGate = (effect) => effect();
let gate: ReplySideEffectGate = now;

/** Install the gate (the LiveKit adapter does, when it loads). */
export function setReplySideEffectGate(next: ReplySideEffectGate | null): void {
  gate = next ?? now;
}

/** Run a side effect of voicing a reply, as the installed gate decides. */
export function whenReplyPlays(
  effect: () => void,
  env?: Readonly<Record<string, string | undefined>>
): void {
  gate(effect, env);
}
