/**
 * Ferni's own energy on a call (FERNI_STATE=on, agents/personas/ferni-state.ts),
 * as the Director reads it: low energy slows the reply a touch, high quickens
 * it a touch. The turn reminder writes the level each turn, before the reply's
 * audio opens; the pacing lever still smooths and clamps the result.
 *
 * The porch light (PORCH_LIGHT=on, agents/personas/porch-light.ts) is read
 * here too: on a call the caller started in their small hours, the reply is a
 * touch slower and a little quieter. Speed reaches every voice (a Pro clone
 * through the Stage 2 tempo); volume is a <volume> tag, which every voice
 * honors (config/voice-capabilities.ts).
 *
 * Keyed by session, bounded, and cleared when the session ends
 * (session-mgmt/session-cleanup.ts). Same pattern as caller-prosody.ts.
 *
 * @module speech/tts-gateway/director/ferni-energy
 */

export type FerniEnergyLevel = 'low' | 'steady' | 'high';

/** Small on purpose: tired should be heard as unhurried, not slow. */
const SPEED_NUDGE: Record<FerniEnergyLevel, number> = { low: -0.03, steady: 0, high: 0.02 };
/** Porch light: about 6% slower once pacing settles, and softer, never a whisper. */
export const PORCH_LIGHT_SPEED_NUDGE = -0.03;
export const PORCH_LIGHT_VOLUME = 0.85;
const MAX_SESSIONS = 1000;

const levels = new Map<string, FerniEnergyLevel>();
const porchLit = new Set<string>();

function bound(keys: Map<string, unknown> | Set<string>): void {
  while (keys.size > MAX_SESSIONS) {
    const oldest = keys.keys().next().value;
    if (oldest === undefined) break;
    keys.delete(oldest);
  }
}

/** Set this session's level, or forget it (undefined: the flag is off, or another persona speaks). */
export function setFerniEnergy(sessionId: string, level: FerniEnergyLevel | undefined): void {
  levels.delete(sessionId);
  if (!level) return;
  levels.set(sessionId, level);
  bound(levels);
}

export function ferniEnergyFor(sessionId: string | undefined): FerniEnergyLevel | undefined {
  return sessionId ? levels.get(sessionId) : undefined;
}

/** Turn this session's porch light voice on or off. */
export function setPorchLight(sessionId: string, on: boolean): void {
  porchLit.delete(sessionId);
  if (!on) return;
  porchLit.add(sessionId);
  bound(porchLit);
}

export function porchLightOn(sessionId: string | undefined): boolean {
  return sessionId !== undefined && porchLit.has(sessionId);
}

/** The pace nudge for this session's next reply (0 when nothing is set). */
export function ferniSpeedNudge(sessionId: string | undefined): number {
  const level = ferniEnergyFor(sessionId);
  const energy = level ? SPEED_NUDGE[level] : 0;
  return energy + (porchLightOn(sessionId) ? PORCH_LIGHT_SPEED_NUDGE : 0);
}

/** The volume this session's next reply is scaled by (1 when nothing is set). */
export function ferniVolume(sessionId: string | undefined): number {
  return porchLightOn(sessionId) ? PORCH_LIGHT_VOLUME : 1;
}

const VOLUME_TAG = /<volume\s+ratio="([\d.]+)"\s*\/>/g;

/**
 * A reply's leading tags with every volume scaled by `factor` (inside
 * Cartesia's 0.5-2), and a volume added to the opening if it had none, so a
 * later return to 1 (after a soft start) stays quiet too.
 */
export function scaleVolumeTags(tags: string, factor: number, opening: boolean): string {
  if (factor === 1) return tags;
  const scaled = (ratio: number): string =>
    `<volume ratio="${Math.round(Math.min(2, Math.max(0.5, ratio * factor)) * 100) / 100}"/>`;
  let found = false;
  const out = tags.replace(VOLUME_TAG, (_tag, ratio: string) => {
    found = true;
    return scaled(Number(ratio));
  });
  return found || !opening ? out : `${out}${scaled(1)}`;
}

export function clearFerniEnergy(sessionId: string): void {
  levels.delete(sessionId);
  porchLit.delete(sessionId);
}
