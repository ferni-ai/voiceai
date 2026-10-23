/**
 * Whether the session TTS declares an aligned transcript (TTS_ALIGNED_TRANSCRIPT).
 *
 * With alignedTranscript set, the SDK paces captions by the word timings on the
 * TTS audio instead of its 3.83 syllables/s estimate (@livekit/agents
 * voice/agent_activity.js). PersonaAwareTTS declares it only when its inner
 * Cartesia TTS asks for timings and the TTS gateway is off: with the gateway on
 * (the default), the gateway's own provider speaks the replies and returns no
 * timings, and an aligned transcript with no timings leaves the caption, and the
 * assistant message saved to history, empty.
 *
 * @module @ferni/speech/tts/aligned-transcript
 */

import type { tts } from '@livekit/agents';
import { flagOn } from '../../config/env-flag.js';
import { ttsGatewayEnabled } from './prewarm-voice.js';

/** `declared`, plus alignedTranscript when the flag is on and `inner` can deliver it. */
export function withAlignedTranscript(
  declared: tts.TTSCapabilities,
  inner: { capabilities: tts.TTSCapabilities } | undefined
): tts.TTSCapabilities {
  const aligned =
    flagOn('TTS_ALIGNED_TRANSCRIPT') &&
    !ttsGatewayEnabled() &&
    inner?.capabilities.alignedTranscript === true;
  return aligned ? { ...declared, alignedTranscript: true } : declared;
}
