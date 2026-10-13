/**
 * Pass a delegate TTS's metrics and errors on to the TTS the agent session holds.
 *
 * The session listens for `metrics_collected` and `error` on the TTS it was
 * given (agent_activity.js in @livekit/agents 1.5.1), but the SDK emits both on
 * the TTS that ran the stream. A wrapper that hands synthesis to an inner TTS
 * (PersonaAwareTTS hands it to Cartesia) has to pass them on, or the session
 * sees no TTS time-to-first-byte (TURN_RECEIPT ttsTtfbMs was null in 135 of 135
 * prod receipts) and no TTS failure.
 *
 * Metrics are always passed on. Errors are always logged here; they reach the
 * session only with TTS_FORWARD_ERRORS on, because the session counts
 * unrecoverable TTS errors and closes the call after more than three in a row
 * without the agent speaking (AgentSession._onError).
 *
 * @module speech/tts/forward-tts-events
 */
import type { metrics, tts } from '@livekit/agents';
import { flagOn, type Env } from '../../config/env-flag.js';
import { getLogger } from '../../utils/safe-logger.js';

type TtsError = Parameters<tts.TTSCallbacks['error']>[0];

const log = getLogger();

/**
 * Re-emit `inner`'s metrics (and, with TTS_FORWARD_ERRORS on, its errors) on
 * `outer`. Returns a function that removes the listeners from `inner`; call it
 * before dropping `inner`, so a replaced TTS neither leaks listeners nor
 * reports into the session.
 */
export function forwardTtsEvents(
  inner: tts.TTS,
  outer: tts.TTS,
  env: Env = process.env
): () => void {
  const onMetrics = (m: metrics.TTSMetrics): void => {
    outer.emit('metrics_collected', m);
  };
  const onError = (ev: TtsError): void => {
    log.warn({ label: ev.label, recoverable: ev.recoverable, error: ev.error }, 'TTS_INNER_ERROR');
    // An 'error' emit with no listener throws, so only pass it on to a listener.
    if (flagOn('TTS_FORWARD_ERRORS', env) && outer.listenerCount('error') > 0) {
      outer.emit('error', ev);
    }
  };
  inner.on('metrics_collected', onMetrics);
  inner.on('error', onError);
  return () => {
    inner.off('metrics_collected', onMetrics);
    inner.off('error', onError);
  };
}
