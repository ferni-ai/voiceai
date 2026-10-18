/**
 * Which presence tune played on the quiet-window path (voiced-presence.ts),
 * as an id that can be kept and played again (NAMED_TUNE, tune-state.ts).
 * No new audio: `whistle:<file>` is a recorded whistle (presence-clips.ts),
 * `take:<category>:<index>` one of Ferni's own voiced hums.
 *
 * @module agents/integrations/presence-tune
 */

import { VOICED_TAKES, type VoicedCategory } from '../shared/reaction-clips.js';
import { presenceClipName, presenceClipNamed } from './presence-clips.js';

export const recordedWhistleId = (pcm: ArrayBuffer): string | null => {
  const file = presenceClipName(pcm);
  return file ? `whistle:${file}` : null;
};

export const takeTuneId = (category: VoicedCategory, index: number): string =>
  `take:${category}:${index}`;

/** By prefix: "whistle:people-human-happy-whistle..." has "hum" in it. */
export const tuneKind = (id: string): 'whistle' | 'hum' =>
  id.startsWith('whistle:') ? 'whistle' : 'hum';

/** What to play for a kept tune id, with its log label; null if it isn't available. */
export function tuneAudio(
  id: string,
  getTake: (text: string) => ArrayBuffer | null
): { pcm: ArrayBuffer; label: string } | null {
  const [kind, a = '', b] = id.split(':');
  if (kind === 'whistle') {
    const pcm = presenceClipNamed('whistles', a);
    return pcm ? { pcm, label: `recorded-whistle:${a}` } : null;
  }
  const text = kind === 'take' ? VOICED_TAKES[a as VoicedCategory]?.[Number(b)] : undefined;
  const pcm = text ? getTake(text) : null;
  return pcm && text ? { pcm, label: text } : null;
}
