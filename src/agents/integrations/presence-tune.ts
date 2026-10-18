/**
 * Which presence tune played, as an id that can be kept and played again
 * (NAMED_TUNE, services/session/tune-state.ts). No new audio: the id points
 * at whatever presence sound is live.
 *
 * - `whistle:<file>`: one of the recorded whistles (PRESENCE_SOUND_ASSETS, presence-clips.ts)
 * - `take:<category>:<index>`: one of Ferni's own voiced hums (VOICED_PRESENCE)
 * - `synth-whistle:<n>` / `synth-hum:<n>`: the synthesized whistle or hum's nth tune
 *
 * @module agents/integrations/presence-tune
 */

import { VOICED_TAKES, type VoicedCategory } from '../shared/reaction-clips.js';
import { presenceClipName, presenceClipNamed } from './presence-clips.js';
import { synthHum, synthWhistle, TUNE_COUNT } from './presence-sounds.js';

export const recordedWhistleId = (pcm: ArrayBuffer): string | null => {
  const file = presenceClipName(pcm);
  return file ? `whistle:${file}` : null;
};

export const takeTuneId = (category: VoicedCategory, index: number): string =>
  `take:${category}:${index}`;

export const synthTuneId = (kind: 'whistle' | 'hum', tune: number): string =>
  `synth-${kind}:${tune}`;

/** Whistle or hum, by id ("whistle:people-human-happy-whistle..." has "hum" in it). */
export const tuneKind = (id: string): 'whistle' | 'hum' =>
  id.startsWith('whistle:') || id.startsWith('synth-whistle:') ? 'whistle' : 'hum';

/** A random synthesized tune number. */
export const randomTune = (rng: () => number = Math.random): number =>
  Math.floor(rng() * TUNE_COUNT) % TUNE_COUNT;

/** What to play for a kept tune id: the audio and its log label, or null if it isn't available. */
export function tuneAudio(
  id: string,
  getTake: (text: string) => ArrayBuffer | null
): { pcm: ArrayBuffer; label: string } | null {
  const at = id.indexOf(':');
  const kind = id.slice(0, at);
  const rest = id.slice(at + 1);
  if (kind === 'whistle') {
    const pcm = presenceClipNamed('whistles', rest);
    return pcm ? { pcm, label: `recorded-whistle:${rest}` } : null;
  }
  if (kind === 'take') {
    const [category, index] = rest.split(':');
    const text = VOICED_TAKES[category as VoicedCategory]?.[Number(index)];
    const pcm = text ? getTake(text) : null;
    return pcm && text ? { pcm, label: text } : null;
  }
  const tune = Number(rest);
  if (!Number.isInteger(tune) || tune < 0 || tune >= TUNE_COUNT) return null;
  if (kind === 'synth-whistle') return { pcm: synthWhistle({ tune }), label: id };
  if (kind === 'synth-hum') return { pcm: synthHum({ tune }), label: id };
  return null;
}
