/**
 * LATENCY_ARM_PERCENT (default 0, off): a sticky per-call A/B arm for latency
 * experiments that reaches every caller, account member or not.
 *
 * Cohort flags (cohort-flags.ts) reach member identities only, and phone callers who
 * are not members are most prod turns (82%, 2026-10-28..31). So this arm is drawn
 * from the session id: at call start LATENCY_ARM_PERCENT% of calls are `treatment`
 * and get TREATMENT_FLAGS, the rest are `control` and get nothing. The same session
 * id always lands in the same arm. A caller whose own cohorts or overrides give one
 * of those flags a value keeps it (`own`), and the call is left out of the A/B.
 *
 * It is applied with the caller's cohort flags in applyCallerFlags, so it goes back
 * to the agent's own values at the next call start, and only while a worker process
 * serves one call at a time (oneCallPerProcess). Each TURN_RECEIPT says the arm.
 *
 * @module services/platform/latency-arm
 */
import { createHash } from 'node:crypto';

/** What the treatment arm sets for its call (docs: latency first-token plan, #1). */
const TREATMENT_FLAGS: Readonly<Record<string, string>> = {
  PREEMPT_STABLE_CONTEXT: 'on',
};

export type LatencyArm = 'treatment' | 'control' | 'own';

/** 0 to 100; anything unset or not a number is 0 (off). */
export function latencyArmPercent(env: Record<string, string | undefined> = process.env): number {
  const raw = env.LATENCY_ARM_PERCENT?.trim();
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

/** The session's place in the A/B, 0 to 99.99, stable per session id. */
export function armBucket(sessionId: string): number {
  const h = createHash('sha256').update(`latency-arm:${sessionId}`).digest();
  return (h.readUInt32BE(0) / 2 ** 32) * 100;
}

/** The arm the session id draws, or null with the A/B off. */
export function drawArm(
  sessionId: string | undefined,
  env: Record<string, string | undefined> = process.env
): 'treatment' | 'control' | null {
  const percent = latencyArmPercent(env);
  if (!sessionId || percent <= 0) return null;
  return armBucket(sessionId) < percent ? 'treatment' : 'control';
}

// The arm of recent calls, for their receipts. One call per process, so a few is plenty.
const arms = new Map<string, LatencyArm>();
const MAX_REMEMBERED = 32;

/** The arm this call ran in, as applied at its start; null when it had none. */
export function latencyArmFor(sessionId: string): LatencyArm | null {
  return arms.get(sessionId) ?? null;
}

/**
 * The caller's flags with the arm's added. The caller's own values (cohorts and
 * overrides) win. Returns the caller's flags unchanged with the A/B off.
 */
export function withLatencyArm(
  sessionId: string | undefined,
  callerFlags: Record<string, string>,
  env: Record<string, string | undefined> = process.env
): Record<string, string> {
  const drawn = drawArm(sessionId, env);
  if (!sessionId || !drawn) return callerFlags;
  const own = Object.keys(TREATMENT_FLAGS).some((flag) => flag in callerFlags);
  const arm: LatencyArm = own ? 'own' : drawn;
  arms.delete(sessionId);
  arms.set(sessionId, arm);
  if (arms.size > MAX_REMEMBERED) arms.delete(arms.keys().next().value as string);
  return arm === 'treatment' ? { ...TREATMENT_FLAGS, ...callerFlags } : callerFlags;
}

/** For tests: forget the remembered arms. */
export function forgetLatencyArms(): void {
  arms.clear();
}
