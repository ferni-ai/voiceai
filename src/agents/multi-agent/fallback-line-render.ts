/**
 * Renders a never-silent fallback line (never-silent.ts) to audio frames with
 * one Cartesia /tts/bytes request, checked before its body is read as audio.
 *
 * Prod, 2026-11: the pre-render was rejected in 39 of 40 calls, always at 4 ms.
 * It went through the LiveKit Cartesia plugin's REST path, which sends no
 * Content-Type (Cartesia requires application/json) plus the WebSocket-only
 * max_buffer_delay_ms, then feeds whatever body comes back to the PCM decoder
 * without looking at the status. This request matches the TTS gateway's
 * (speech/tts-gateway/providers/cartesia.ts), and a body is audio only with a
 * 2xx status and an audio content type.
 *
 * It never throws and runs outside LiveKit's TTS classes, so a failed render
 * cannot reach the session as a TTS error.
 *
 * @module agents/multi-agent/fallback-line-render
 */
import { AudioByteStream } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import {
  CARTESIA_API_URL,
  CARTESIA_API_VERSION,
  CARTESIA_MODEL,
  cartesiaPronunciation,
} from '../../config/voice-ids.js';

const SAMPLE_RATE = 24_000;
const BYTES_API = `${CARTESIA_API_URL.replace(/\/$/, '')}/tts/bytes`;

/** Why a line has no audio. Logged as is: no words. */
type RenderFailure = 'no_voice' | 'no_key' | 'network' | 'http_status' | 'not_audio' | 'empty';

export type RenderedLine =
  { frames: AudioFrame[] } | { failure: RenderFailure; statusClass?: string };

/** Raw PCM is served as audio/*; some proxies relabel binary bodies as octet-stream. */
function isAudioContentType(contentType: string | null): boolean {
  const type = contentType?.split(';')[0].trim().toLowerCase() ?? '';
  return type.startsWith('audio/') || type === 'application/octet-stream';
}

export async function renderFallbackLine(
  text: string,
  voiceId: string,
  deps: { fetch?: typeof fetch; env?: Record<string, string | undefined> } = {}
): Promise<RenderedLine> {
  const env = deps.env ?? process.env;
  const apiKey = env.CARTESIA_API_KEY;
  if (!apiKey) return { failure: 'no_key' };
  let response: Response;
  try {
    response = await (deps.fetch ?? fetch)(BYTES_API, {
      method: 'POST',
      headers: {
        'Cartesia-Version': CARTESIA_API_VERSION,
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: CARTESIA_MODEL,
        ...cartesiaPronunciation(env),
        transcript: text,
        voice: { mode: 'id', id: voiceId },
        output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: SAMPLE_RATE },
        language: 'en',
      }),
    });
  } catch {
    return { failure: 'network' };
  }
  if (!response.ok) {
    return { failure: 'http_status', statusClass: `${Math.floor(response.status / 100)}xx` };
  }
  if (!isAudioContentType(response.headers.get('content-type'))) return { failure: 'not_audio' };
  let pcm: ArrayBuffer;
  try {
    pcm = await response.arrayBuffer();
  } catch {
    return { failure: 'network' };
  }
  if (pcm.byteLength < 2) return { failure: 'empty' };
  const decoder = new AudioByteStream(SAMPLE_RATE, 1);
  return { frames: [...decoder.write(pcm), ...decoder.flush()] };
}
