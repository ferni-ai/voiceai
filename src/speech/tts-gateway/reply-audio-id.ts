/**
 * Tag a gateway TTS node's returned audio stream with the reply id the
 * Speech Director used to key its Stage 2 plan (review H2).
 *
 * Every TTS stream the gateway opens — the real reply, a filler, `say()`, a
 * pre-tool phrase — used to carry the same (sessionId, turn) key, so any of
 * them could consume (or discard) another stream's plan. A per-reply id,
 * generated once per call to the gateway node and carried only on the
 * stream that call returns, fixes that: Stage 2 takes a plan only when its
 * stream's id matches. A stream nothing tagged (a cached clip, a stream the
 * Director never ran on) is simply never looked up, so it gets no Stage 2.
 *
 * @module speech/tts-gateway/reply-audio-id
 */

const replyAudioIds = new WeakMap<object, string>();

/** Associate `stream` with the reply id its gateway TTS node run used. */
export function tagReplyAudioId(stream: object, replyId: string): void {
  replyAudioIds.set(stream, replyId);
}

/** The reply id `stream` was tagged with, or undefined (never tagged). */
export function getReplyAudioId(stream: object | null | undefined): string | undefined {
  return stream ? replyAudioIds.get(stream) : undefined;
}
