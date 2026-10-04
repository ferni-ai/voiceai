/**
 * The Speech Director gate.
 *
 * SPEECH_DIRECTOR=off|shadow|live (default shadow; off under tests). Off
 * leaves the gateway's reply and text streams untouched; shadow plans each
 * reply and logs one line without changing what Cartesia receives; live
 * applies the plan.
 *
 * Each lever has its own override (SPEECH_DIRECTOR_PHRASING, _PAUSES,
 * _NORMALIZE, _EMOTION, _PACING) so a regression can be pinned to one lever.
 * An override can only lower a lever below the global mode. The newer levers
 * (SPEECH_DIRECTOR_NONVERBAL, _LAUGHTER) are opt-in: off unless set, so
 * turning the Director live never turns them on by itself.
 *
 * @module speech/tts-gateway/director/gate
 */

import type { DirectorMode, Lever, LeverModes } from './types.js';

type Env = Record<string, string | undefined>;

const RANK: Record<DirectorMode, number> = { off: 0, shadow: 1, live: 2 };

function parseMode(value: string | undefined): DirectorMode | undefined {
  const mode = value?.trim().toLowerCase();
  return mode === 'off' || mode === 'shadow' || mode === 'live' ? mode : undefined;
}

export function speechDirectorMode(env: Env = process.env): DirectorMode {
  const explicit = parseMode(env.SPEECH_DIRECTOR);
  if (explicit) return explicit;
  return env.VITEST || env.NODE_ENV === 'test' ? 'off' : 'shadow';
}

export function leverModes(env: Env = process.env): LeverModes {
  const global = speechDirectorMode(env);
  const lower = (lever: Lever, unset: DirectorMode = global): DirectorMode => {
    const override = parseMode(env[`SPEECH_DIRECTOR_${lever.toUpperCase()}`]) ?? unset;
    return RANK[override] < RANK[global] ? override : global;
  };
  return {
    phrasing: lower('phrasing'),
    pauses: lower('pauses'),
    normalize: lower('normalize'),
    emotion: lower('emotion'),
    pacing: lower('pacing'),
    nonverbal: lower('nonverbal', 'off'),
    laughter: lower('laughter', 'off'),
  };
}
