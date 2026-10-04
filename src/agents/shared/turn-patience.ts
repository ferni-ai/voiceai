/**
 * How long Ferni waits after the caller stops before taking the turn.
 *
 * The turn detector picks a delay between these two: the minimum when the
 * caller sounds finished, up to the maximum when they sound mid-thought.
 * Human gaps after a finished turn are ~200 ms, but thinking pauses inside a
 * turn run well past a second; the old 150/450 ms cap made Ferni answer into
 * those pauses ("it overlaps with the dialogue"). The fix is the maximum
 * (thinking pauses). The minimum stays short: gaps of 700 ms or more read as
 * hesitation (Kendrick & Torreira 2015) and reply latency already adds 2+ s.
 * Env overrides allow tuning by ear on dev.
 */

export const DEFAULT_MIN_ENDPOINTING_MS = 300;
export const DEFAULT_MAX_ENDPOINTING_MS = 2500;

function readMs(raw: string | undefined, fallback: number, lo: number, hi: number): number {
  const ms = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(ms) ? Math.min(Math.max(Math.round(ms), lo), hi) : fallback;
}

/** Endpointing delays for the agent session (CASCADE_MIN/MAX_ENDPOINTING_MS). */
export function endpointingDelays(env: Record<string, string | undefined> = process.env): {
  minEndpointingDelay: number;
  maxEndpointingDelay: number;
} {
  const min = readMs(env.CASCADE_MIN_ENDPOINTING_MS, DEFAULT_MIN_ENDPOINTING_MS, 100, 2000);
  const max = readMs(env.CASCADE_MAX_ENDPOINTING_MS, DEFAULT_MAX_ENDPOINTING_MS, 300, 6000);
  return { minEndpointingDelay: min, maxEndpointingDelay: Math.max(max, min) };
}
