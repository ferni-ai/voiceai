/**
 * Renders Seth's kept presence takes (VOICED_TAKES) per voice for the audio
 * cache, passing on the `<emotion>`/`<speed>`/`<volume>` tags the voice honors
 * (voice-capabilities.ts) where the cache's renderer strips all tags. Approved
 * model and API version, 24 kHz, silence (<= -50 dBFS) trimmed, one loudness.
 *
 * @module agents/shared/voiced-take-render
 */

import {
  CARTESIA_API_VERSION,
  CARTESIA_SNAPSHOT,
  cartesiaPronunciation,
} from '../../config/voice-ids.js';
import { voiceHonorsProsodyTags, voiceHonorsVolumeTag } from '../../config/voice-capabilities.js';
import { createLogger } from '../../utils/safe-logger.js';
import { BACKCHANNEL_TAKES, VOICED_TAKES } from './reaction-clips.js';

const log = createLogger({ module: 'VoicedTakeRender' });

/** VOICED_PRESENCE=on: presence sounds and extra reaction variants from Seth's kept takes. */
export function voicedPresenceEnabled(env: Record<string, string | undefined> = process.env) {
  return env.VOICED_PRESENCE === 'on';
}

/** The takes to render alongside `already` (the reaction clips); none with the flag off. */
export function voicedTakeTexts(already: readonly string[] = []): string[] {
  if (!voicedPresenceEnabled()) return [];
  return [...new Set(Object.values(VOICED_TAKES).flat())].filter((t) => !already.includes(t));
}

/**
 * BACKCHANNEL_TIMING=on (backchannel-timing.ts): the backchannel bag's takes to
 * render alongside `already`; none with the flag off, so nothing new renders.
 */
export function backchannelTakeTexts(
  already: readonly string[] = [],
  env: Record<string, string | undefined> = process.env
): string[] {
  if (env.BACKCHANNEL_TIMING !== 'on') return [];
  const all = [
    ...Object.values(BACKCHANNEL_TAKES.soft),
    ...Object.values(BACKCHANNEL_TAKES.bright),
  ];
  return [...new Set(all.flat())].filter((t) => !already.includes(t));
}

/** The transcript to send for this voice: tags it honors kept, every other tag stripped. */
export function transcriptForVoice(text: string, voiceId: string): string {
  const keep = (name: string): boolean =>
    /^(emotion|speed)$/i.test(name)
      ? voiceHonorsProsodyTags(voiceId)
      : /^volume$/i.test(name) && voiceHonorsVolumeTag(voiceId);
  return text
    .replace(/<([a-z]+)\b[^>]*>/gi, (tag, name: string) => (keep(name) ? tag : ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

const RATE = 24000;
const SILENCE = 32767 * 10 ** (-50 / 20);
/** -20 dBFS RMS over the sounding part, peaks held under -1 dBFS. */
const TARGET_RMS = 32767 * 0.1;
const PEAK_CEILING = 32767 * 0.89;

/** Trim leading/trailing silence (keeping 10 ms) and normalize loudness; null if all silent. */
export function trimAndNormalize(pcm: ArrayBuffer): ArrayBuffer | null {
  const s = new Int16Array(pcm, 0, Math.floor(pcm.byteLength / 2));
  let first = -1;
  let last = -1;
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const a = Math.abs(s[i]);
    if (a <= SILENCE) continue;
    if (first < 0) first = i;
    last = i;
    peak = Math.max(peak, a);
    sum += a * a;
    n++;
  }
  if (first < 0) return null;
  const pad = RATE / 100;
  const from = Math.max(0, first - pad);
  const gain = Math.min(TARGET_RMS / Math.sqrt(sum / n), PEAK_CEILING / peak);
  return Int16Array.from(s.subarray(from, Math.min(s.length, last + 1 + pad)), (x) =>
    Math.round(x * gain)
  ).buffer;
}

/** Render one take for a voice; null when there is no key or Cartesia fails. */
export async function renderVoicedTake(text: string, voiceId: string): Promise<ArrayBuffer | null> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'Cartesia-Version': CARTESIA_API_VERSION,
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: CARTESIA_SNAPSHOT,
        ...cartesiaPronunciation(),
        transcript: transcriptForVoice(text, voiceId),
        voice: { mode: 'id', id: voiceId },
        output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: RATE },
        language: 'en',
      }),
    });
    if (response.ok) return trimAndNormalize(await response.arrayBuffer());
    log.warn({ status: response.status, text }, 'voiced take render failed');
  } catch (error) {
    log.warn({ error: String(error), text }, 'voiced take render failed');
  }
  return null;
}

/**
 * A backchannel take past this, trimmed, is not cached (a later warm renders it
 * again): no longer than today's plain clips, 720 ms with their lead silence
 * (p50 across 10 persona voices); a long "mm-hm" is the one talked over.
 */
export const BACKCHANNEL_TAKE_MAX_MS = 800;

/** renderVoicedTake for a backchannel take: null when it runs past BACKCHANNEL_TAKE_MAX_MS. */
export async function renderBackchannelTake(
  text: string,
  voiceId: string
): Promise<ArrayBuffer | null> {
  const pcm = await renderVoicedTake(text, voiceId);
  return pcm && pcm.byteLength <= (RATE * 2 * BACKCHANNEL_TAKE_MAX_MS) / 1000 ? pcm : null;
}
