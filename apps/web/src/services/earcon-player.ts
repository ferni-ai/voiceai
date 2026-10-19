/**
 * Earcon player: the sound director's one output (flag ferni:sound-director).
 *
 * iOS ignores HTMLMediaElement.volume, so an MP3 played through an <audio>
 * element is as loud on a phone as the file is. Here the call's earcons are
 * decoded into WebAudio buffers and played through one master gain, which iOS
 * does honor:
 * - arrival and goodbye: loudness-normalized copies of connect.mp3 and
 *   disconnect.mp3 (public/sounds/earcons, both -28 LUFS, rendered with
 *   `ffmpeg -i connect.mp3 -af loudnorm=I=-28:TP=-6:LRA=7:linear=true`);
 * - handoff: the persona's own procedural chime (its register and timbre),
 *   trimmed to the same loudness and routed into the same gain.
 *
 * The audio context starts on the first tap or key after the director is on
 * (browsers only start audio from a gesture), and loads both files then.
 *
 * @module services/earcon-player
 */

import { createLogger } from '../utils/logger.js';
import { proceduralSounds } from './procedural-sounds.service.js';

const log = createLogger('EarconPlayer');

/** The call's three moments (sound-director.ts decides when each may play). */
export type Earcon = 'arrival' | 'handoff' | 'goodbye';

export const EARCON_FILES = {
  arrival: '/sounds/earcons/arrival.mp3',
  goodbye: '/sounds/earcons/goodbye.mp3',
} as const;

/** The one master level for every earcon. */
export const EARCON_MASTER_GAIN = 0.9;

/**
 * Per-persona trim (dB) that brings each procedural handoff chime to the
 * files' -28 LUFS. Measured 2026-10-17 with ffmpeg ebur128 on an offline
 * render of each profile in procedural-sounds.service.ts (ferni -22.0,
 * peter/jack -23.3, maya -20.2, jordan -23.7, alex -23.0, nayan -20.8 LUFS).
 */
export const HANDOFF_TRIM_DB: Readonly<Record<string, number>> = {
  ferni: -6.4,
  peter: -5.1,
  jack: -5.1,
  maya: -8.2,
  jordan: -4.7,
  alex: -5.4,
  nayan: -7.6,
};

interface Output {
  ctx: AudioContext;
  master: GainNode;
  handoff: GainNode;
  buffers: Map<keyof typeof EARCON_FILES, Promise<AudioBuffer | null>>;
}

let output: Output | null = null;

const dbToGain = (db: number): number => Math.pow(10, db / 20);

async function load(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await ctx.decodeAudioData(await response.arrayBuffer());
  } catch (error) {
    log.warn('Earcon not loaded', { url, error: String(error) });
    return null;
  }
}

/** Starts the earcon output. Call from a user gesture; safe to call again. */
export function unlockEarcons(): boolean {
  if (output) {
    if (output.ctx.state !== 'running') void output.ctx.resume().catch(() => {});
    return true;
  }
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = EARCON_MASTER_GAIN;
    master.connect(ctx.destination);
    const handoff = ctx.createGain();
    handoff.connect(master);
    proceduralSounds.routeTo(ctx, handoff);
    const buffers = new Map(
      (Object.keys(EARCON_FILES) as Array<keyof typeof EARCON_FILES>).map(
        (name) => [name, load(ctx, EARCON_FILES[name])] as const
      )
    );
    output = { ctx, master, handoff, buffers };
    void ctx.resume().catch(() => {});
    return true;
  } catch (error) {
    log.warn('Earcon output not started', { error: String(error) });
    return false;
  }
}

/** Plays one earcon through the master gain. `personaId` picks the handoff's voice. */
export async function playEarcon(earcon: Earcon, personaId = 'ferni'): Promise<void> {
  if (!output && !unlockEarcons()) return;
  const out = output;
  if (!out) return;
  if (out.ctx.state !== 'running') await out.ctx.resume().catch(() => {});
  if (earcon === 'handoff') {
    const id = personaId.split('-')[0]?.toLowerCase() ?? 'ferni';
    out.handoff.gain.value = dbToGain(HANDOFF_TRIM_DB[id] ?? HANDOFF_TRIM_DB.ferni ?? 0);
    await proceduralSounds.playHandoffSound(id);
    return;
  }
  const buffer = await out.buffers.get(earcon);
  if (!buffer) return;
  const source = out.ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(out.master);
  source.start();
}

const GESTURES = ['touchend', 'click', 'keydown'] as const;

/** Starts the output on the first gesture while `isOn()`; does nothing while it is off. */
export function installEarconUnlock(isOn: () => boolean): void {
  const onGesture = (): void => {
    if (!isOn() || !unlockEarcons()) return;
    GESTURES.forEach((type) => document.removeEventListener(type, onGesture, true));
  };
  GESTURES.forEach((type) => document.addEventListener(type, onGesture, true));
}
