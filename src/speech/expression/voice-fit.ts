/**
 * Fit a sanitized chunk to what the active TTS engine can render.
 *
 * A tag the engine cannot perform is worse than none: a plain engine reads
 * "[laughter]" aloud, and ignored prosody makes logs and caches lie about
 * what the caller heard.
 *
 * @module speech/expression/voice-fit
 */

import type { SSMLProsodyConfig } from '../tts-gateway/types.js';

import type { VoiceCapabilities } from './types.js';

const LAUGHTER_TAG = /\s*\[laughter\]\s*/gi;

export function fitToVoice(
  chunk: { text: string; prosody: SSMLProsodyConfig },
  voice: VoiceCapabilities
): { text: string; prosody: SSMLProsodyConfig } {
  let { text } = chunk;
  const prosody = { ...chunk.prosody };
  if (!voice.laughter && text.includes('[')) {
    text = text
      .replace(LAUGHTER_TAG, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  if (!voice.emotion) delete prosody.emotion;
  if (!voice.pace) {
    delete prosody.speed;
    delete prosody.volume;
  }
  return { text, prosody };
}
