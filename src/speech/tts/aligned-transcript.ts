/**
 * Whether the session TTS declares an aligned transcript (TTS_ALIGNED_TRANSCRIPT).
 *
 * With alignedTranscript set, the SDK paces captions by the word timings on the
 * TTS audio instead of its 3.83 syllables/s estimate (@livekit/agents
 * voice/agent_activity.js). PersonaAwareTTS declares it when the voice that
 * speaks the replies returns timings: with the TTS gateway off, its inner
 * Cartesia TTS; with it on (the default), the gateway's Cartesia reply stream,
 * which puts the words on its frames (tts-gateway/word-timings.ts). Other
 * gateway paths (Sonata, per-sentence synthesis, cached audio) return none, and
 * an aligned transcript with no timings leaves the caption, and the assistant
 * message saved to history, empty, so it is not declared for them.
 *
 * @module @ferni/speech/tts/aligned-transcript
 */

import type { tts } from '@livekit/agents';
import { flagOn } from '../../config/env-flag.js';
import { getTTSProvider } from '../tts-gateway/providers/index.js';
import { ttsGatewayEnabled } from './prewarm-voice.js';

type Env = Record<string, string | undefined>;

/**
 * The gateway voices replies on a Cartesia reply stream (createStreamingOverlapTTS
 * in tts-gateway/gateway-tts-node.ts), the one gateway path that carries timings.
 */
export function gatewayWordTimings(
  provider: { name: string; openReplyStream?: unknown } = getTTSProvider(),
  env: Env = process.env
): boolean {
  return (
    provider.name === 'cartesia' &&
    typeof provider.openReplyStream === 'function' &&
    env.TTS_REPLY_CONTINUATIONS !== 'false' &&
    env.STREAMING_TTS_OVERLAP !== 'false'
  );
}

/** `declared`, plus alignedTranscript when the flag is on and the speaking voice can deliver it. */
export function withAlignedTranscript(
  declared: tts.TTSCapabilities,
  inner: { capabilities: tts.TTSCapabilities } | undefined
): tts.TTSCapabilities {
  const aligned =
    flagOn('TTS_ALIGNED_TRANSCRIPT') &&
    (ttsGatewayEnabled() ? gatewayWordTimings() : inner?.capabilities.alignedTranscript === true);
  return aligned ? { ...declared, alignedTranscript: true } : declared;
}
