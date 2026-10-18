/**
 * How long Ferni waits after the caller stops before taking the turn.
 *
 * LiveKit waits the minimum after the caller's last speech. Human gaps after a
 * finished turn are ~200 ms, but thinking pauses inside a turn run well past a
 * second; the old 150/450 ms cap made Ferni answer into those pauses ("it
 * overlaps with the dialogue"). The minimum stays short: gaps of 700 ms or
 * more read as hesitation (Kendrick & Torreira 2015) and reply latency already
 * adds 2+ s.
 *
 * The maximum applies only with LiveKit's end-of-turn model on (TURN_DETECTOR
 * below): @livekit/agents 1.9.3 waits the minimum when the model says the turn
 * is likely over and the maximum when it says unlikely, nothing in between.
 * Without the model (stt or vad turn detection) every turn waits the minimum.
 * In the default stt mode ink-2 decides when the caller has finished; tune
 * pauses there with CASCADE_TURN_END (cartesia-cascade.ts). Env overrides allow
 * tuning by ear on dev.
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
 * caller has finished. cloud is turn-detector-v1 on LiveKit Inference (the
 * agent's LIVEKIT_API_KEY/SECRET, or LIVEKIT_INFERENCE_*); local is
 * turn-detector-v1-mini, native in @livekit/local-inference. Default off; dev
 * A/B decides.
 *
 * What it changes, read from @livekit/agents 1.9.3:
 * - LiveKit ignores ink-2's own start and end of speech (they only count in
 *   stt mode) and ends the turn from Silero's end of speech plus the model.
 * - ink-2 still transcribes, and it sends its final only when it ends the turn
 *   itself (turn.end). LiveKit never commits a turn without a final, so ink's
 *   end threshold stays a floor: the model can wait longer than ink, never
 *   answer sooner. For the model to decide, let ink end early
 *   (CASCADE_TURN_END=0.5).
 * - A cloud model that fails or takes over 1 s on a prediction falls back to
 *   v1-mini for the rest of the session; detector.model then says so, and the
 *   TURN_RECEIPT's eot.model with it.
 * - Our own end-of-turn holds still run unless TURN_DETECTOR_SOLE=on
 *   (turn-detector-sole.ts).
 *
 * The local model runs through the job's inference executor
 * (core/inference-executor.ts). LiveKit registers the runner only in its own
 * Worker class, which our worker doesn't use, so it is registered here.
 */
export type TurnDetectorMode = 'cloud' | 'local' | 'off';

export function turnDetectorMode(
  env: Record<string, string | undefined> = process.env
): TurnDetectorMode {
  return env.TURN_DETECTOR === 'cloud' ? 'cloud' : env.TURN_DETECTOR === 'local' ? 'local' : 'off';
}

const EOT_METHOD = 'lk_eot_audio';
/**
 * The wait when the model says the caller isn't done. Kept under the turn
 * keeper's 2.5 s grace (turn-keeper.ts) so the keeper never answers first.
 */
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
    log.warn(
      { error: String(error) },
      'Local end-of-turn model unavailable; keeping default turn detection'
    );
    return false;
  }
}

/**
 * The session's turn detection: LiveKit's audio model when TURN_DETECTOR is on,
 * else `fallback`. The model needs VAD: without it LiveKit drops the detector
 * and, with it, the stt mode, so ink's turn end would be ignored too.
 */
export function sessionTurnDetection<T>(
  fallback: T,
  env: Record<string, string | undefined> = process.env,
  hasVad = true
): T | inference.TurnDetector {
  const mode = turnDetectorMode(env);
  if (mode !== 'off' && !hasVad) {
    log.warn({ mode }, 'TURN_DETECTOR needs VAD; keeping default turn detection');
    return fallback;
  }
  // The local runner is cloud's fallback too, so it is registered either way.
  if (mode === 'off' || !registerLocalEotRunner()) return fallback;
  if (mode === 'cloud') {
    try {
      const detector = new inference.TurnDetector({ version: 'v1' });
      log.info({ model: detector.model }, 'TURN_DETECTOR cloud');
      return detector;
    } catch (error) {
      // An explicit v1 throws when the LiveKit credentials are missing.
      log.warn({ error: String(error) }, 'TURN_DETECTOR cloud unavailable; using the local model');
    }
  }
  log.info({ model: 'turn-detector-v1-mini' }, 'TURN_DETECTOR local');
  return new inference.TurnDetector({ version: 'v1-mini' });
}

/** The parts of LiveKit's live AgentActivity (session._activity) that say how turns end. */
interface ActivityTurnView {
  _activity?: { _resolvedTurnDetection?: unknown; turnDetectionMode?: string };
}

/**
 * What decides the end of the caller's turn on this session now, for the
 * TURN_RECEIPT: the LiveKit model in use ('turn-detector-v1', or
 * 'turn-detector-v1-mini' once cloud has fallen back to local), 'stt' (ink-2's
 * own turn end in the cascade), 'vad', 'default' when LiveKit dropped the
 * setting, or 'unknown' with no activity running.
 */
export function turnDetectionInUse(session: unknown): string {
  const activity = (session as ActivityTurnView | undefined)?._activity;
  if (!activity) return 'unknown';
  const model = (activity._resolvedTurnDetection as { model?: unknown } | undefined)?.model;
  if (typeof model === 'string') return model;
  return activity.turnDetectionMode ?? 'default';
}
