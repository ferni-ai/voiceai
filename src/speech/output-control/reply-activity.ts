/**
 * When a session's reply audio was last produced by TTS.
 *
 * The agent's "speaking" state lags the first audio, so a sound meant to fill
 * the wait before a reply (turn-opening-sound.ts) could start on top of the
 * reply's first word. TTS marks the moment its first audio frame exists, and
 * the moment the reply's first words reached it (audio follows ~120 ms later).
 *
 * An opening sound that did play holds the reply's first audio until the clip
 * has finished, so the two never overlap (replyAudioHoldMs).
 *
 * @module speech/output-control/reply-activity
 */

const lastReplyAudioAt = new Map<string, number>();
const lastReplyTextAt = new Map<string, number>();
const replyAudioHeldUntil = new Map<string, number>();

/** The longest an opening sound may hold a reply back, whatever the clip says. */
export const MAX_REPLY_HOLD_MS = 800;

export function noteReplyAudio(sessionId: string, at: number = Date.now()): void {
  lastReplyAudioAt.set(sessionId, at);
}

/** Whether reply audio has been produced for this session at or after `since`. */
export function replyAudioSince(sessionId: string, since: number): boolean {
  return (lastReplyAudioAt.get(sessionId) ?? 0) >= since;
}

/** The reply's first words reached TTS. */
export function noteReplyText(sessionId: string, at: number = Date.now()): void {
  lastReplyTextAt.set(sessionId, at);
}

/** Whether reply words have reached TTS for this session at or after `since`. */
export function replyTextSince(sessionId: string, since: number): boolean {
  return (lastReplyTextAt.get(sessionId) ?? 0) >= since;
}

/** Hold the next reply's first audio for `ms` from now (an opening sound is playing). */
export function holdReplyAudio(sessionId: string, ms: number, now: number = Date.now()): void {
  replyAudioHeldUntil.set(sessionId, now + Math.min(Math.max(0, ms), MAX_REPLY_HOLD_MS));
}

/** How long reply audio must still wait; 0 when nothing holds it. */
export function replyAudioHoldMs(sessionId: string, now: number = Date.now()): number {
  return Math.max(0, (replyAudioHeldUntil.get(sessionId) ?? 0) - now);
}

export function clearReplyActivity(sessionId: string): void {
  lastReplyAudioAt.delete(sessionId);
  lastReplyTextAt.delete(sessionId);
  replyAudioHeldUntil.delete(sessionId);
}
