/**
 * One audio analysis stream per session.
 *
 * processAudioStream (audio-processor.ts) is started by two paths for the same
 * call: the multi-agent track subscription in agent-setup.ts and
 * FerniAgent.sttNode's tee. Both fed every frame through the session's
 * analyzers, so prosody timing, pause detection and voice emotion saw doubled
 * audio, at twice the CPU. A second stream for a session already being
 * processed is cancelled (an unread tee branch would buffer forever) and
 * ignored.
 *
 * @module voice-agent/session-audio-claim
 */

import { log } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import type { ReadableStream } from 'node:stream/web';

/** Sessions whose audio processAudioStream is currently reading. */
const sessionsBeingProcessed = new Set<string>();

/**
 * Claim the session's audio analysis for this stream. Returns false, after
 * cancelling the stream, if another stream already holds the claim. A missing
 * sessionId is never deduplicated.
 */
export async function claimSessionAudio(
  sessionId: string | undefined,
  audio: ReadableStream<AudioFrame>
): Promise<boolean> {
  if (!sessionId) return true;
  if (sessionsBeingProcessed.has(sessionId)) {
    log().debug(
      { sessionId },
      'Audio already being processed for this session; ignoring a second stream'
    );
    await audio.cancel().catch(() => undefined);
    return false;
  }
  sessionsBeingProcessed.add(sessionId);
  return true;
}

/** Release the claim taken by claimSessionAudio once the stream ends. */
export function releaseSessionAudio(sessionId: string | undefined): void {
  if (sessionId) sessionsBeingProcessed.delete(sessionId);
}
