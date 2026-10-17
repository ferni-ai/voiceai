/**
 * Demo calls end on time. DEMO_CALL_CAP=on.
 *
 * `/demo-token` puts `is_demo`, `demo_id` and `session_duration_minutes` in
 * the room metadata, but before this nothing in the agent read them, so a
 * signed-out guest could talk until MAX_CALL_MS (3 hours).
 *
 * With the flag on and `is_demo` true, the call is capped at
 * `session_duration_minutes` (clamped to 1 to 10, 3 when missing or not a
 * number). DEMO_WARNING_LEAD_MS before the end Ferni says DEMO_WARNING_LINE,
 * DEMO_GOODBYE_LEAD_MS before it DEMO_GOODBYE_LINE, and at the end
 * waitForSessionEnd's own cap timer (session-end-watch.ts) settles with
 * `demo_limit`, so the call closes on the same path as `max_duration`.
 *
 * With the flag off, or for any call that isn't a demo, demoCallCap returns
 * null and nothing here runs.
 *
 * @module voice-agent/phases/demo-call-cap
 */
import { flagOn, type Env } from '../../../config/env-flag.js';
import { createLogger } from '../../../utils/safe-logger.js';
import type { SessionEndOptions } from './session-end-watch.js';

const log = createLogger({ module: 'demo-call-cap' });

export const DEMO_DEFAULT_MINUTES = 3;
export const DEMO_MIN_MINUTES = 1;
export const DEMO_MAX_MINUTES = 10;
export const DEMO_WARNING_LEAD_MS = 30_000;
/** Time for the goodbye to be spoken before the call closes. */
export const DEMO_GOODBYE_LEAD_MS = 10_000;
export const DEMO_END_REASON = 'demo_limit';

// Spoken through TTS: full sentences, commas and full stops only (speech-markup-notes.ts).
export const DEMO_WARNING_LINE =
  'Just so you know, we have about thirty seconds left in this demo call.';
export const DEMO_GOODBYE_LINE =
  "That's our time for today, and I really enjoyed talking with you. " +
  'If you sign in, we can pick this right back up and keep talking. Take care.';

/** Minutes clamped to DEMO_MIN_MINUTES..DEMO_MAX_MINUTES; DEMO_DEFAULT_MINUTES when not a number. */
export function clampDemoMinutes(value: unknown): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEMO_DEFAULT_MINUTES;
  return Math.min(DEMO_MAX_MINUTES, Math.max(DEMO_MIN_MINUTES, n));
}

function parseRoomMetadata(metadata: string | undefined): Record<string, unknown> | null {
  if (!metadata) return null;
  try {
    const parsed: unknown = JSON.parse(metadata);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    log.warn({ kind: typeof parsed }, 'DEMO_CALL_CAP room metadata is not an object; no cap');
  } catch (err) {
    log.warn({ err: String(err) }, 'DEMO_CALL_CAP room metadata is not JSON; no cap');
  }
  return null;
}

/** The call's length limit in ms, or null when the flag is off or this isn't a demo. */
export function demoCallCap(metadata: string | undefined, env: Env = process.env): number | null {
  if (!flagOn('DEMO_CALL_CAP', env)) return null;
  const meta = parseRoomMetadata(metadata);
  if (!meta || (meta.is_demo !== true && meta.is_demo !== 'true')) return null;
  const minutes = clampDemoMinutes(meta.session_duration_minutes);
  log.info(
    { demoId: meta.demo_id, minutes, asked: meta.session_duration_minutes },
    'DEMO_CALL_CAP demo call capped'
  );
  return minutes * 60_000;
}

export interface DemoCallCap {
  /** Options for waitForSessionEnd: its cap timer ends the call at the limit. */
  endOptions: SessionEndOptions;
  /** Clears the warning and goodbye timers. Safe to call more than once. */
  stop: () => void;
}

/**
 * Schedules the warning and the goodbye for a capped call. `say` speaks a
 * line on whichever agent is live; a throw from it is logged, not raised.
 */
export function startDemoCallCap(
  limitMs: number,
  say: (text: string) => unknown
): DemoCallCap {
  const speak = (line: string, which: string): void => {
    const fail = (err: unknown): void => {
      log.warn({ which, err: String(err) }, 'DEMO_CALL_CAP could not speak line');
    };
    try {
      // say may return a promise or a speech handle; a rejection is logged too
      Promise.resolve(say(line)).catch(fail);
      log.info({ which }, 'DEMO_CALL_CAP line spoken');
    } catch (err) {
      fail(err);
    }
  };
  const warning = setTimeout(
    () => speak(DEMO_WARNING_LINE, 'warning'),
    Math.max(0, limitMs - DEMO_WARNING_LEAD_MS)
  );
  const goodbye = setTimeout(
    () => speak(DEMO_GOODBYE_LINE, 'goodbye'),
    Math.max(0, limitMs - DEMO_GOODBYE_LEAD_MS)
  );
  return {
    endOptions: { maxMs: limitMs, maxReason: DEMO_END_REASON },
    stop: () => {
      clearTimeout(warning);
      clearTimeout(goodbye);
    },
  };
}
