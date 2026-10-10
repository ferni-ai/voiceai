/**
 * How long Ferni waits after the caller stops before taking the turn.
 *
 * The turn detector picks a delay between these two: the minimum when the
 * caller sounds finished, up to the maximum when they sound mid-thought.
 * Human gaps after a finished turn are ~200 ms, but thinking pauses inside a
 * turn run well past a second; the old 150/450 ms cap made Ferni answer into
 * those pauses ("it overlaps with the dialogue"). The minimum stays short:
 * gaps of 700 ms or more read as hesitation (Kendrick & Torreira 2015) and
 * reply latency already adds 2+ s.
 *
 * The maximum only applies when LiveKit's own turn detection runs
 * (CASCADE_TURN_DETECTION=vad). In the default stt mode ink-2 decides when the
 * caller has finished and LiveKit waits the minimum after that; tune pauses
 * there with CASCADE_TURN_END (cartesia-cascade.ts). Env overrides allow tuning
 * by ear on dev.
 */

import { InferenceRunner, inference } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'turn-patience' });

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
  const cap = turnDetectorMode(env) !== 'off' ? DETECTOR_MAX_ENDPOINTING_MS : Infinity;
  return { minEndpointingDelay: min, maxEndpointingDelay: Math.max(Math.min(max, cap), min) };
}

/**
 * TURN_DETECTOR=cloud|local: LiveKit's audio end-of-turn model decides when the
 * caller has finished. cloud is the full turn-detector-v1 on LiveKit's inference
 * gateway (the agent's LIVEKIT_API_KEY/SECRET); local is turn-detector-v1-mini,
 * native in @livekit/local-inference, and also cloud's fallback. It decides
 * from how they sound as well as what they said. It replaces ink-2's own turn
 * end and the word-list hold in unfinished-turn.ts, which still answered
 * half-sentences after mid-thought pauses (judge.mjs, real-call scenario:
 * understanding 1-1.5). Default off; dev A/B decides.
 *
 * It runs through the job's inference executor (core/inference-executor.ts).
 * LiveKit registers the runner only in its own Worker class, which our worker
 * doesn't use, so it is registered here.
 */
export type TurnDetectorMode = 'cloud' | 'local' | 'off';

export function turnDetectorMode(env: Record<string, string | undefined> = process.env): TurnDetectorMode {
  return env.TURN_DETECTOR === 'cloud' ? 'cloud' : env.TURN_DETECTOR === 'local' ? 'local' : 'off';
}

const EOT_METHOD = 'lk_eot_audio';
/** With the model on, it decides, not this cap; a long cap only delays the turn keeper's grace. */
export const DETECTOR_MAX_ENDPOINTING_MS = 2000;

export function registerLocalEotRunner(
  resolve: (spec: string) => string = (spec) => import.meta.resolve(spec)
): boolean {
  if (InferenceRunner.registeredRunners[EOT_METHOD]) return true;
  try {
    const runner = new URL('./inference/eot/runner.js', resolve('@livekit/agents')).toString();
    InferenceRunner.registerRunner(EOT_METHOD, runner);
    return true;
  } catch (error) {
    log.warn({ error: String(error) }, 'Local end-of-turn model unavailable; keeping default turn detection');
    return false;
  }
}

/** The session's turn detection: LiveKit's audio model when TURN_DETECTOR is on, else `fallback`. */
export function sessionTurnDetection<T>(
  fallback: T,
  env: Record<string, string | undefined> = process.env
): T | inference.TurnDetector {
  const mode = turnDetectorMode(env);
  // The local runner is cloud's fallback too, so it is registered either way.
  if (mode === 'off' || !registerLocalEotRunner()) return fallback;
  if (mode === 'cloud') {
    try {
      const detector = new inference.TurnDetector({ version: 'v1' });
      log.info({ model: 'turn-detector-v1' }, 'TURN_DETECTOR cloud');
      return detector;
    } catch (error) {
      // v1 throws when the LiveKit credentials are missing.
      log.warn({ error: String(error) }, 'TURN_DETECTOR cloud unavailable; using the local model');
    }
  }
  log.info({ model: 'turn-detector-v1-mini' }, 'TURN_DETECTOR local');
  return new inference.TurnDetector({ version: 'v1-mini' });
}
