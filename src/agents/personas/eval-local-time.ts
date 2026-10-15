/**
 * Eval-only: the local time Ferni's state reads (ferni-state.ts), so the
 * late-night voice eval can run at any hour (job metadata eval_local_time,
 * "HH:MM" on his clock in America/Denver).
 *
 * Production can never move his clock. Same gate as the temporal eval clock
 * (#702, eval-clock.ts): honoured only when the worker itself runs with
 * VOICE_EVAL_CLOCK=on (a local eval worker, never dev or prod secrets) AND the
 * caller is a synthetic eval user (id starts with "voice-eval-"). Anything
 * else in the dispatch metadata is ignored.
 *
 * @module agents/personas/eval-local-time
 */

export interface LocalTime {
  hour: number;
  minute: number;
}

const HH_MM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Ferni's clock for this eval call, or undefined (always, outside evals). */
export function evalLocalTime(
  userId: string | null | undefined,
  metadata: Record<string, unknown>,
  env: Record<string, string | undefined> = process.env
): LocalTime | undefined {
  if (env.VOICE_EVAL_CLOCK !== 'on') return undefined;
  if (typeof userId !== 'string' || !userId.startsWith('voice-eval-')) return undefined;
  const raw = metadata.eval_local_time;
  const match = typeof raw === 'string' ? HH_MM.exec(raw.trim()) : null;
  if (!match) return undefined;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}
