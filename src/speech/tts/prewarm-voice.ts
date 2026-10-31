/**
 * Which connection to warm for a persona's next reply.
 *
 * @livekit/agents 1.9 calls the session TTS's `prewarm()` whenever an agent
 * activity starts or resumes (handoffs included). With the TTS gateway on (the
 * default), replies never reach the session TTS: the agent's ttsNode sends
 * them to the gateway's provider, so that provider's socket is the one to open
 * (an already open socket makes this a no-op). With the gateway off, the inner
 * Cartesia plugin TTS synthesizes, so it is warmed instead.
 *
 * @module @ferni/speech/tts/prewarm-voice
 */

import { getTTSProvider } from '../tts-gateway/providers/index.js';

/** Same switch as isTTSGatewayEnabled (tts-gateway/index.ts), without importing the gateway. */
export function ttsGatewayEnabled(): boolean {
  return process.env.USE_TTS_GATEWAY !== 'false';
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

/**
 * Warm the gateway provider, or `pluginTTS` when the gateway is off. Never
 * throws: a synchronous throw, or a rejection if a provider's prewarm returns
 * a promise, goes to `onError`. (`ITTSProvider.prewarm` is typed `void` and the
 * Cartesia provider catches its own connect failure; this guards the rest.)
 */
export function prewarmReplyVoice(
  pluginTTS: { prewarm: () => void },
  onError: (error: unknown) => void
): void {
  try {
    const result: unknown = ttsGatewayEnabled()
      ? getTTSProvider().prewarm?.()
      : pluginTTS.prewarm();
    if (isThenable(result)) result.then(undefined, onError);
  } catch (error) {
    onError(error);
  }
}
