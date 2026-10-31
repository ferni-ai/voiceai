/**
 * CRISIS_GUARD_MODE: whether the reply gate runs (agents/personas/crisis-gate.ts).
 *   off     — no evaluation, zero cost
 *   shadow  — evaluate + log; the reply is untouched
 *   live    — evaluate + log, and the reply is gated (DEFAULT)
 *
 * Any unrecognised value resolves to live, so a typo can never silently disable
 * the guard. Here in services so the safety service can ask it too
 * (legacy-word-checks.ts); agents/safety/crisis-shadow.ts re-exports it.
 *
 * @module services/safety/crisis-guard-mode
 */

export type CrisisGuardMode = 'off' | 'shadow' | 'live';

export function resolveCrisisGuardMode(
  env: Record<string, string | undefined> = process.env
): CrisisGuardMode {
  const raw = env.CRISIS_GUARD_MODE?.trim().toLowerCase();
  return raw === 'off' || raw === 'shadow' ? raw : 'live';
}
