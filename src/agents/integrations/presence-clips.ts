/**
 * PRESENCE_SOUND_ASSETS=on: Ferni's presence whistle and snore are recordings
 * of a person (assets/, Pixabay Content License, see LICENSE.md there) instead
 * of the synthesized ones. Seth rejected every synthesized or voice-converted
 * whistle in his rating; these he picked by ear.
 *
 * The clips are 24 kHz mono 16-bit WAV, the clip player's format. Each call
 * gets its own shuffled bag per kind: every clip plays once before any
 * repeats, and the same clip never plays twice in a row. With no clips found
 * (or the flag off) the caller falls back to the synthesized sound.
 *
 * @module agents/integrations/presence-clips
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PresenceClips' });

const SAMPLE_RATE = 24_000;
const ASSET_DIR = 'agents/integrations/assets';

export type PresenceClipKind = 'whistles' | 'snores';

export function presenceSoundAssetsEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.PRESENCE_SOUND_ASSETS === 'on';
}

/** The PCM of a 24 kHz mono 16-bit PCM WAV, or null for any other format. */
export function pcmFromWav(wav: Buffer): ArrayBuffer | null {
  if (
    wav.length < 12 ||
    wav.toString('ascii', 0, 4) !== 'RIFF' ||
    wav.toString('ascii', 8, 12) !== 'WAVE'
  )
    return null;
  let format: { pcm: boolean; channels: number; rate: number; bits: number } | null = null;
  for (let at = 12; at + 8 <= wav.length;) {
    const id = wav.toString('ascii', at, at + 4);
    const size = wav.readUInt32LE(at + 4);
    const body = at + 8;
    if (id === 'fmt ' && body + 16 <= wav.length) {
      format = {
        pcm: wav.readUInt16LE(body) === 1,
        channels: wav.readUInt16LE(body + 2),
        rate: wav.readUInt32LE(body + 4),
        bits: wav.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      const ok =
        format &&
        format.pcm &&
        format.channels === 1 &&
        format.rate === SAMPLE_RATE &&
        format.bits === 16;
      if (!ok) return null;
      const end = Math.min(body + size, wav.length);
      return wav.buffer.slice(wav.byteOffset + body, wav.byteOffset + end) as ArrayBuffer;
    }
    at = body + size + (size % 2); // chunks are word-aligned
  }
  return null;
}

/** Where a kind's clips live: the source tree in dev and tests, dist/ in the agent image. */
export function presenceClipDirs(kind: PresenceClipKind, cwd = process.cwd()): string[] {
  return [join(cwd, 'src', ASSET_DIR, kind), join(cwd, 'dist', ASSET_DIR, kind)];
}

const names = new WeakMap<ArrayBuffer, string>();

/** The file a loaded clip came from, for the logs (so ratings map to plays). */
export function presenceClipName(pcm: ArrayBuffer): string | undefined {
  return names.get(pcm);
}

/** Every valid clip in the first folder that has any; a clip in the wrong format is skipped and logged. */
export function loadPresenceClips(dirs: readonly string[]): ArrayBuffer[] {
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.wav'))
      .sort();
    const clips = files.flatMap((file) => {
      const pcm = pcmFromWav(readFileSync(join(dir, file)));
      if (!pcm) log.warn({ file }, 'Presence clip skipped: not 24 kHz mono 16-bit PCM');
      if (pcm) names.set(pcm, file);
      return pcm ? [pcm] : [];
    });
    if (clips.length > 0) return clips;
  }
  log.warn({ dirs }, 'No presence clips found; the synthesized sound plays instead');
  return [];
}

export interface ClipPicker {
  /** The next clip, or null when there are none. */
  next: () => ArrayBuffer | null;
}

/** Picks clips from a shuffled bag: all of them before any repeats, never the same one twice in a row. */
export function createClipPicker(
  clips: readonly ArrayBuffer[],
  rng: () => number = Math.random
): ClipPicker {
  let bag: ArrayBuffer[] = [];
  let last: ArrayBuffer | null = null;
  const refill = (): void => {
    bag = [...clips];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const swap = bag[i] as ArrayBuffer;
      bag[i] = bag[j] as ArrayBuffer;
      bag[j] = swap;
    }
    // The bag is drawn from the end: keep a fresh bag from starting with the clip just played
    const end = bag.length - 1;
    if (end > 0 && bag[end] === last)
      [bag[0], bag[end]] = [bag[end] as ArrayBuffer, bag[0] as ArrayBuffer];
  };
  return {
    next(): ArrayBuffer | null {
      if (clips.length === 0) return null;
      if (bag.length === 0) refill();
      last = bag.pop() ?? null;
      return last;
    },
  };
}

/** One call's pickers, or null with the flag off. Clips are read once per process and shared. */
const cache = new Map<PresenceClipKind, ArrayBuffer[]>();
function clipsOf(kind: PresenceClipKind): ArrayBuffer[] {
  const cached = cache.get(kind);
  if (cached) return cached;
  const loaded = loadPresenceClips(presenceClipDirs(kind));
  cache.set(kind, loaded);
  return loaded;
}

/** The loaded clip from this file, or null (a kept named tune, presence-tune.ts). */
export function presenceClipNamed(kind: PresenceClipKind, file: string): ArrayBuffer | null {
  return clipsOf(kind).find((pcm) => names.get(pcm) === file) ?? null;
}

/** VOICED_QUIRKS: the recorded snores, whatever PRESENCE_SOUND_ASSETS says (voiced-presence.ts). */
export function snoreClipPicker(rng: () => number = Math.random): ClipPicker {
  return createClipPicker(clipsOf('snores'), rng);
}

export function presenceClipPickers(
  env: Record<string, string | undefined> = process.env
): { whistle: ClipPicker; snore: ClipPicker } | null {
  if (!presenceSoundAssetsEnabled(env)) return null;
  return {
    whistle: createClipPicker(clipsOf('whistles')),
    snore: createClipPicker(clipsOf('snores')),
  };
}
