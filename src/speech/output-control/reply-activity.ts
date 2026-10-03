/**
 * When a session's reply audio was last produced by TTS.
 *
 * The agent's "speaking" state lags the first audio, so a sound meant to fill
 * the wait before a reply (turn-opening-sound.ts) could start on top of the
 * reply's first word. TTS marks the moment its first audio frame exists.
 *
 * @module speech/output-control/reply-activity
 */

const lastReplyAudioAt = new Map<string, number>();

export function noteReplyAudio(sessionId: string, at: number = Date.now()): void {
  lastReplyAudioAt.set(sessionId, at);
}

/** Whether reply audio has been produced for this session at or after `since`. */
export function replyAudioSince(sessionId: string, since: number): boolean {
  return (lastReplyAudioAt.get(sessionId) ?? 0) >= since;
}

export function clearReplyActivity(sessionId: string): void {
  lastReplyAudioAt.delete(sessionId);
}
