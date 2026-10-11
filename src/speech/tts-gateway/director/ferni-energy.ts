/**
 * Ferni's own energy on a call (FERNI_STATE=on, agents/personas/ferni-state.ts),
 * as the Director reads it: low energy slows the reply a touch, high quickens
 * it a touch. The turn reminder writes the level each turn, before the reply's
 * audio opens; the pacing lever still smooths and clamps the result.
 *
 * Keyed by session, bounded, and cleared when the session ends
 * (session-mgmt/session-cleanup.ts). Same pattern as caller-prosody.ts.
 *
 * @module speech/tts-gateway/director/ferni-energy
 */

export type FerniEnergyLevel = 'low' | 'steady' | 'high';

/** Small on purpose: tired should be heard as unhurried, not slow. */
const SPEED_NUDGE: Record<FerniEnergyLevel, number> = { low: -0.03, steady: 0, high: 0.02 };
const MAX_SESSIONS = 1000;

const levels = new Map<string, FerniEnergyLevel>();

/** Set this session's level, or forget it (undefined: the flag is off, or another persona speaks). */
export function setFerniEnergy(sessionId: string, level: FerniEnergyLevel | undefined): void {
  levels.delete(sessionId);
  if (!level) return;
  levels.set(sessionId, level);
  while (levels.size > MAX_SESSIONS) {
    const oldest = levels.keys().next().value;
    if (oldest === undefined) break;
    levels.delete(oldest);
  }
}

export function ferniEnergyFor(sessionId: string | undefined): FerniEnergyLevel | undefined {
  return sessionId ? levels.get(sessionId) : undefined;
}

/** The pace nudge for this session's next reply (0 when nothing is set). */
export function ferniSpeedNudge(sessionId: string | undefined): number {
  const level = ferniEnergyFor(sessionId);
  return level ? SPEED_NUDGE[level] : 0;
}

export function clearFerniEnergy(sessionId: string): void {
  levels.delete(sessionId);
}
